import {
  Component,
  OnInit,
  QueryList,
  ViewChildren,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Renderer2,
  Input,
  ViewContainerRef,
  ComponentFactoryResolver,
  ComponentFactory,
  ComponentRef,
  OnDestroy,
  Attribute,
} from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { MinToolbarComponent } from '../min-toolbar/min-toolbar.component';
import { TreeService } from '../../services/tree.service';
import { Payload } from '../../models/Payload';
import { Tag } from '../../models/Tag';
import {
  calculateCaretPosition,
  calculateCorrection,
  findAllOccurrencesOfPattern,
  getCaretPosition,
  setCaretAtPosition,
} from '../../utils';

const BR_ELEMENT = '<br>';

@Component({
  selector: 'editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  rows: Range;
  width: number;
  activeTag: Tag;
  activeRow: number;
  lastSegmentOffset: number;
  hiddenSegments: boolean;
  openedToolbar: boolean;
  componentRef: ComponentRef<MinToolbarComponent>;

  private toolbarState$: Subject<boolean> = new Subject<boolean>();
  toolbarStateObs$: Observable<boolean> = this.toolbarState$.asObservable().pipe(distinctUntilChanged());

  @ViewChildren('editableDiv')
  divs: QueryList<any>;

  @ViewChild('h1')
  hPrimaryEl: ElementRef<any>;

  @ViewChild('h2')
  hSecondaryEl: ElementRef<any>;

  @ViewChild('h3')
  hTertiaryEl: ElementRef<any>;

  @ViewChild('h4')
  hQuaternaryEl: ElementRef<any>;

  @ViewChild('paragraph')
  paragraphEl: ElementRef<any>;

  @ViewChild('quote')
  quoteEl: ElementRef<any>;

  @ViewChild('toolbar')
  toolbar: ElementRef<any>;

  @ViewChild('toolbarContainer', { read: ViewContainerRef }) container;

  @Input() set currWidth(value: number) {
    this.hiddenSegments = value < this.lastSegmentOffset + 10;

    if (!this.hiddenSegments) {
      this.openedToolbar = this.hiddenSegments;
      this.toolbarState$.next(this.openedToolbar);
    }
  }

  tagsMap: Map<string, ElementRef>;

  constructor(
    private renderer: Renderer2,
    private treeService: TreeService,
    private resolver: ComponentFactoryResolver
  ) {
    this.rows = range(1, treeService.entityValues.length);
    this.tagsMap = new Map<string, ElementRef>();
  }

  ngOnInit(): void {
    this.toolbarStateObs$.subscribe((isOpened: boolean) => {
      this.toggleToolbar(isOpened);
    });
  }

  ngAfterViewInit(): void {
    const toolbarChildren = Array.from(this.toolbar.nativeElement.children);
    const lastSegment = toolbarChildren[toolbarChildren.length - 1] as HTMLElement;
    this.lastSegmentOffset = lastSegment.clientWidth + lastSegment.offsetLeft;

    this.tagsMap
      .set('primaryHeader', this.hPrimaryEl)
      .set('secondaryHeader', this.hSecondaryEl)
      .set('tertiaryHeader', this.hTertiaryEl)
      .set('quaternaryHeader', this.hQuaternaryEl)
      .set('paragraph', this.paragraphEl)
      .set('quote', this.quoteEl);

    this.divs.changes.subscribe((data: any) => {
      data._results[this.activeRow - 1].nativeElement.focus();
    });
    this.repaintEditor();
  }

  ngOnDestroy(): void {
    this.componentRef.destroy();
  }

  private repaintEditor(): void {
    const entityValues = this.treeService.entityValues;
    this.rows = range(1, entityValues.length);

    setTimeout(() => {
      this.divs.forEach((div, i) => {
        div.nativeElement.innerHTML = entityValues[i] || '';
      });
    });
  }

  onFocus(event, rowNo: number): void {
    const rowData = this.treeService.getEntityRow(rowNo);

    this.activeRow = rowNo;

    // temporarily switched off
    // const caretPosition = rowData.text.replace(new RegExp(BR_ELEMENT, 'g'), '').length;
    // if (caretPosition > 0) {
    //   setTimeout(() => {
    //     setCaretAtPosition(caretPosition, event.target.lastChild);
    //   });
    // }

    if (this.openedToolbar) {
      this.componentRef.instance.activeRow = rowNo;
      this.componentRef.instance.activeTag = this.activeTag;
      this.componentRef.instance.refreshView(rowData);
      return;
    }

    const prevActive = this.activeTag;
    this.activeTag = rowData.tag;

    if (this.activeTag && this.activeTag !== rowData.tag) {
      this.renderer.removeClass(this.tagsMap.get(this.activeTag).nativeElement, 'tag--selected');
    }

    if (prevActive && prevActive !== this.activeTag) {
      this.renderer.removeClass(this.tagsMap.get(prevActive).nativeElement, 'tag--selected');
    }

    this.renderer.addClass(this.tagsMap.get(rowData.tag).nativeElement, 'tag--selected');
  }

  onPaste(event, rowNo: number, ref): void {
    event.preventDefault();

    const clipboardData = event.clipboardData;
    const pastedData = clipboardData.getData('Text');

    ref.innerHTML = pastedData;

    const payload = {
      rowNo,
      text: pastedData,
      opName: 'addText',
    } as Partial<Payload>;

    this.treeService.updateEntityTree(payload);
  }

  onTextTyped(event, rowNo: number): void {
    const payload = {
      rowNo,
      text: event.target.innerHTML,
      opName: 'addText',
    } as Partial<Payload>;

    this.treeService.updateEntityTree(payload);
  }

  onKeyPressed(event, rowNo: number): void {
    const rowData = this.treeService.getEntityRow(rowNo);

    if (event.key === 'Enter') {
      const [, end] = getCaretPosition(event.target);

      if (!event.shiftKey) {
        event.preventDefault();

        const indexes = findAllOccurrencesOfPattern(rowData.text, BR_ELEMENT);
        const correctionGrade = calculateCorrection(end, indexes, BR_ELEMENT.length);

        const caretPosition = indexes.some((index) => end >= index && end < index + BR_ELEMENT.length) ? 0 : end;
        const divisionIndex = caretPosition + correctionGrade * BR_ELEMENT.length;

        const beginText = rowData.text.slice(0, divisionIndex);
        const endText = rowData.text.slice(divisionIndex).replace(new RegExp(`^${BR_ELEMENT}`), '');

        const rows: Array<Payload> = [
          {
            rowNo,
            text: beginText,
            tag: rowData.tag,
            opName: 'addRow',
          },
          {
            rowNo: rowNo + 1,
            text: endText,
            tag: rowData.tag,
            opName: 'addRow',
          },
        ];

        this.treeService.insertEntityRow(rowNo, rows);
        this.activeRow = rowNo + 1;

        this.repaintEditor();
      }
    }
  }

  onKeyEntered(event, rowNo: number): void {
    const { high } = this.rows;
    const rowData = this.treeService.getEntityRow(rowNo);
    const [, end] = getCaretPosition(event.target);

    if (event.key === 'Backspace') {
      if (high === 1 || this.activeRow === 1 || end > 0) {
        // } || end === 0 && rowData.text.startsWith(BR_ELEMENT)) {
        return;
      }

      const previousRowData = this.treeService.getEntityRow(rowNo - 1);
      const text = rowData.text === BR_ELEMENT ? '' : rowData.text;

      const indexes = findAllOccurrencesOfPattern(previousRowData.text, BR_ELEMENT);
      const correctionGrade = calculateCorrection(previousRowData.text.length, indexes, BR_ELEMENT.length);

      const divAffected = this.divs.find((x, i) => i === rowNo - 2).nativeElement;
      const caretPosition = calculateCaretPosition(divAffected, correctionGrade * 2);

      this.treeService.removeEntityRow(rowNo, text);
      this.repaintEditor();
      this.activeRow -= 1;

      if (caretPosition > 0) {
        setTimeout(() => {
          setCaretAtPosition(caretPosition, divAffected.childNodes[correctionGrade * 2]);
        });
      }
    } else if (event.key === 'Delete') {
      if (end !== rowData.text.replace(new RegExp(BR_ELEMENT, 'g'), '').length || rowNo === high) {
        return;
      }
      event.preventDefault();

      const indexes = findAllOccurrencesOfPattern(rowData.text, BR_ELEMENT);
      const correctionGrade = calculateCorrection(rowData.text.length, indexes, BR_ELEMENT.length);

      const divAffected = this.divs.find((x, i) => i === rowNo - 1).nativeElement;
      const caretPosition = calculateCaretPosition(divAffected, correctionGrade * 2);

      const nextRowData = this.treeService.getEntityRow(rowNo + 1);
      const text = nextRowData.text; // === BR_ELEMENT ? '' : nextRowData.text;

      this.treeService.removeEntityRow(rowNo + 1, text);
      this.repaintEditor();

      if (caretPosition > 0) {
        setTimeout(() => {
          setCaretAtPosition(caretPosition, divAffected.childNodes[correctionGrade * 2]);
        });
      }
    } else if (event.key === 'ArrowUp') {
      if (this.activeRow === 1 || (end !== 0 && rowData.text.includes(BR_ELEMENT))) {
        return;
      }

      this.activeRow -= 1;
      this.divs.toArray()[this.activeRow - 1].nativeElement.focus();
    } else if (event.key === 'ArrowDown') {
      if (
        this.activeRow === high ||
        (end !== rowData.text.replace(new RegExp(BR_ELEMENT, 'g'), '').length && rowData.text.includes(BR_ELEMENT))
      ) {
        return;
      }

      this.activeRow += 1;
      this.divs.toArray()[this.activeRow - 1].nativeElement.focus();
    }
  }

  onTagSet(tagName: Tag) {
    if (!this.activeRow) {
      return;
    }

    this.activeTag = tagName;

    const { tag = null } = this.treeService.getEntityRow(this.activeRow);

    const payload = {
      rowNo: this.activeRow,
      tag: tagName,
      opName: 'setTag',
    } as Partial<Payload>;

    this.treeService.updateEntityTree(payload);

    if (tag) {
      this.renderer.removeClass(this.tagsMap.get(tag).nativeElement, 'tag--selected');
    }

    this.renderer.addClass(this.tagsMap.get(tagName).nativeElement, 'tag--selected');
  }

  openToolbar(hamburgerRef: any): void {
    hamburgerRef.classList.toggle('change');
    this.openedToolbar = !this.openedToolbar;
    this.toolbarState$.next(this.openedToolbar);
  }

  toggleToolbar(isOpened: boolean): void {
    if (!this.activeRow) {
      return;
    }

    if (!isOpened) {
      this.container.clear();
    } else {
      const factory: ComponentFactory<MinToolbarComponent> = this.resolver.resolveComponentFactory(MinToolbarComponent);
      this.componentRef = this.container.createComponent(factory);

      this.componentRef.instance.activeRow = this.activeRow;

      this.componentRef.instance.onTagSelect.subscribe(({ tagName, rowTagName }) => {
        const prevActive = this.activeTag;
        this.activeTag = tagName;

        if (this.activeTag && this.activeTag !== rowTagName) {
          this.renderer.removeClass(this.tagsMap.get(rowTagName).nativeElement, 'tag--selected');
        }

        if (prevActive && prevActive !== this.activeTag) {
          this.renderer.removeClass(this.tagsMap.get(prevActive).nativeElement, 'tag--selected');
        }

        this.renderer.addClass(this.tagsMap.get(this.activeTag).nativeElement, 'tag--selected');
      });
    }
  }
}

export class Range implements Iterable<number> {
  constructor(public readonly low: number, public readonly high: number, public readonly step: number = 1) {}

  *[Symbol.iterator]() {
    for (let i = this.low; i <= this.high; i += this.step) {
      yield i;
    }
  }
}

function range(low: number, high: number) {
  return new Range(low, high);
}
