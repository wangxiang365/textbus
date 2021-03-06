import {
  InlineFormatter,
  MatchRule,
  FormatAbstractData,
  VElement,
  ChildSlotMode,
  FormatterPriority, FormatRendingContext
} from '../core/_api';

export class InlineTagFormatter extends InlineFormatter {
  constructor(private tagName: string, rule: MatchRule) {
    super(rule, FormatterPriority.InlineTag);
  }

  read(): FormatAbstractData {
    return new FormatAbstractData({
      tag: this.tagName
    });
  }

  render(context: FormatRendingContext, existingElement?: VElement) {
    if (existingElement && existingElement.tagName === 'span') {
      existingElement.tagName = this.tagName;
      return;
    }
    return new ChildSlotMode(new VElement(this.tagName));
  }
}

export const italicFormatter = new InlineTagFormatter('em', {
  tags: ['em', 'i'],
  styles: {
    fontStyle: ['italic']
  },
  excludeStyles: {
    fontStyle: /(?!italic).+/
  }
});
export const strikeThroughFormatter = new InlineTagFormatter('del', {
  tags: ['strike', 'del', 's'],
  styles: {
    textDecoration: /\bline-through\b/
  }
});
export const underlineFormatter = new InlineTagFormatter('u', {
  tags: ['u'],
  styles: {
    textDecoration: /\bunderline\b/
  }
});
export const subscriptFormatter = new InlineTagFormatter('sub', {
  tags: ['sub']
});
export const superscriptFormatter = new InlineTagFormatter('sup', {
  tags: ['sup']
});
export const codeFormatter = new InlineTagFormatter('code', {
  tags: ['code']
});
