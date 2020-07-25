import { Component, OnInit, ViewEncapsulation, Input } from '@angular/core';
import { TreeService } from './_core/services/tree.service';
import { UserStyles } from './_core/models/Style';

@Component({
  selector: 'ngx-infi-markdown',
  template: `
    <div class="row">
      <editor
        appResizable
        #appResizable="appResizable"
        [resizableMinWidth]="250"
        (onWidthChange)="handleWidthChange($event)"
        class="child"
      ></editor>

      <preview [style.width]="previewWidth" class="child"></preview>

      <div class="switcher">
        <label class="switch">
          <input (change)="toggleStyles($event)" type="checkbox" />
          <span class="slider round"></span>
        </label>
      </div>
    </div>
  `,
  styleUrls: ['./ngx-infi-markdown.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class NgxInfiMarkdownComponent implements OnInit {
  @Input() set styles(value: UserStyles) {
    this.treeService.setUserStyles(value);
  }

  previewWidth: string;

  constructor(private treeService: TreeService) {}

  ngOnInit(): void {}

  handleWidthChange(event: any): void {
    const { percWidth } = event;
    this.previewWidth = 100 - percWidth + '%';
  }

  toggleStyles(event: any): void {
    const status = event.target.checked;
    this.treeService.toggleStyles(status);
  }
}
