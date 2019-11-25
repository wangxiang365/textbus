import { ViewNode } from './view-node';
import { Fragment } from './fragment';

export class Contents implements Iterable<string | ViewNode> {
  get length() {
    return this.elements.reduce((p, n) => p + n.length, 0);
  }

  private elements: Array<string | ViewNode> = [];
  private forOfIndex = 0;

  [Symbol.iterator]() {
    return this;
  }

  next() {
    if (this.forOfIndex < this.length) {
      const value = this.getContentAtIndex(this.forOfIndex);
      this.forOfIndex++;
      return {
        done: false,
        value
      };
    }
    this.forOfIndex = 0;
    return {
      done: true,
      value: undefined
    };
  }

  insert(content: string | ViewNode, index: number) {
    if (index >= this.length) {
      this.elements.push(content);
      return;
    }
    let i = 0;
    let ii = 0;
    for (const el of this.elements) {
      if (index >= i) {
        if (i > index) {
          break;
        }
        if (el instanceof ViewNode) {
          if (index === i + el.length) {
            this.elements.splice(ii, 0, content);
          }
        } else {
          if (index < i + el.length) {
            const newStr = [el.slice(0, index), content, el.slice(index)].join('');
            this.elements.splice(ii, 1, newStr)
          }
        }
      }
      ii++;
      i += el.length;
    }
  }

  add(content: string | ViewNode) {
    const lastChildIndex = this.elements.length - 1;
    const lastChild = this.elements[lastChildIndex];
    if (typeof lastChild === 'string' && typeof content === 'string') {
      this.elements[lastChildIndex] = lastChild + content;
    } else {
      this.elements.push(content);
    }
  }

  slice(startIndex: number, endIndex = this.length) {
    let index = 0;
    const result: Array<string | ViewNode> = [];
    for (const el of this.elements) {
      const fragmentStartIndex = index;
      const fragmentEndIndex = index + el.length;
      index += el.length;

      if (startIndex < fragmentEndIndex && endIndex > fragmentStartIndex) {
        if (typeof el === 'string') {
          const min = Math.max(0, startIndex - fragmentStartIndex);
          const max = Math.min(fragmentEndIndex, endIndex) - fragmentStartIndex;
          result.push(el.slice(min, max));
        } else {
          result.push(el);
        }
      }

    }
    return result;
  }

  getFragments(): Fragment[] {
    return this.elements.filter(i => i instanceof Fragment) as Fragment[];
  }

  find(element: ViewNode): number {
    let index = 0;
    for (const item of this.elements) {
      if (item === element) {
        return index;
      }
      index += item.length;
    }
    return -1;
  }

  getIndexByNode(element: ViewNode) {
    let index = 0;
    for (const item of this.elements) {
      if (item === element) {
        return index;
      }
      if (item instanceof Fragment) {
        index += item.contents.getAllChildContentsLength();
      } else {
        index += item.length;
      }
    }
    return -1;
  }

  getContentAtIndex(index: number) {
    return this.slice(index, index + 1)[0];
  }

  getAllChildContentsLength() {
    let length = 0;
    for (const item of this.elements) {
      if (item instanceof Fragment) {
        length += item.contents.getAllChildContentsLength();
      } else {
        length += item.length
      }
    }
    return length;
  }
}
