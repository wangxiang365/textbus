import { Observable, Subject } from 'rxjs';

import { template } from './template-html';
import { TBSelection } from '../selection/selection';
import { Hooks } from '../toolbar/help';
import { Parser } from '../parser/parser';
import { Handler } from '../toolbar/handlers/help';

export class ViewRenderer {
  elementRef = document.createElement('div');
  onSelectionChange: Observable<TBSelection>;
  onReady: Observable<Document>;

  contentWindow: Window;
  contentDocument: Document;

  private selectionChangeEvent = new Subject<TBSelection>();
  private readyEvent = new Subject<Document>();
  private frame = document.createElement('iframe');
  private selection: TBSelection;
  private hooksList: Hooks[] = [];

  constructor() {
    this.onSelectionChange = this.selectionChangeEvent.asObservable();
    this.onReady = this.readyEvent.asObservable();
    this.frame.onload = () => {
      const doc = this.frame.contentDocument;
      this.contentDocument = doc;
      this.contentWindow = this.frame.contentWindow;

      const selection = new TBSelection(doc);

      this.selection = selection;
      this.readyEvent.next(doc);
      this.elementRef.appendChild(selection.cursorElementRef);


      selection.onSelectionChange.subscribe(s => {
        this.selectionChangeEvent.next(s);
      });
      selection.cursor.onInput.subscribe(v => {
        if (selection.collapsed) {
          this.updateContents(v);
        }
      });
    };
    this.frame.src = `javascript:void((function () {
                      document.open();
                      document.domain = '${document.domain}';
                      document.write('${template}');
                      document.close();
                    })())`;


    this.elementRef.classList.add('tanbo-editor-wrap');
    this.frame.classList.add('tanbo-editor-frame');
    this.elementRef.appendChild(this.frame);
  }

  render(vDom: Parser) {
    this.contentDocument.body.appendChild(vDom.render());
  }

  use(hooks: Hooks) {
    this.hooksList.push(hooks);
    if (typeof hooks.setup === 'function') {
      hooks.setup(this.elementRef, {
        document: this.contentDocument,
        window: this.contentWindow
      });
    }
  }

  private updateContents(content: string) {
    const startIndex = this.selection.firstRange.startIndex;
    const commonAncestorFragment = this.selection.commonAncestorFragment;
    commonAncestorFragment.insert(content, startIndex);
    const oldFragment = commonAncestorFragment.elements;
    const parent = oldFragment[0].parentNode;

    const nextSibling = oldFragment[oldFragment.length - 1].nextSibling;
    commonAncestorFragment.destroyView();
    const newFragment = commonAncestorFragment.render();

    if (nextSibling) {
      parent.insertBefore(newFragment, nextSibling);
    } else {
      parent.appendChild(newFragment);
    }
    this.selection.apply(content.length);
  }

  apply(handler: Handler) {
    const commonAncestorFragment = this.selection.commonAncestorFragment;
    const oldFragment = commonAncestorFragment.elements;
    const parent = oldFragment[0].parentNode;

    const nextSibling = oldFragment[oldFragment.length - 1].nextSibling;
    const overlap = handler.matcher.queryState(this.selection, handler).overlap;
    commonAncestorFragment.destroyView();
    handler.execCommand.command(this.selection, handler, overlap);
    const newFragment = commonAncestorFragment.render();

    if (nextSibling) {
      parent.insertBefore(newFragment, nextSibling);
    } else {
      parent.appendChild(newFragment);
    }

    this.selection.apply();
  }
}
