import { fromEvent, merge, Subscription } from 'rxjs';
import { CubicBezier } from '@tanbo/bezier';

import { findElementByTagName } from '../../edit-frame/utils';
import { EditContext, Hooks } from '../../help';
import { Matcher } from '../../matcher';
import { Formatter } from '../../edit-frame/fomatter/formatter';
import { TableEditActions, TableEditFormatter, CellPosition } from '../../edit-frame/_api';
import { RowPosition } from '../../edit-frame/fomatter/table-edit-formatter';

interface ElementPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class TableEditHook implements Hooks {
  matcher = new Matcher({
    tags: ['table']
  });

  private id = ('id' + Math.random()).replace(/\./, '');
  private mask = document.createElement('div');
  private firstMask = document.createElement('div');
  private selectedCells: HTMLTableCellElement[] = [];
  private startPosition: CellPosition;
  private endPosition: CellPosition;

  private tableElement: HTMLTableElement;
  private startCell: HTMLTableCellElement;
  private endCell: HTMLTableCellElement;
  private cellMatrix: RowPosition[] = [];
  private animateBezier = new CubicBezier(0.25, 0.1, 0.25, 0.1);
  private animateId: number;

  constructor() {
    this.mask.style.cssText = 'position: absolute; box-shadow: inset 0 0 0 2px #1296db; pointer-events: none; overflow: hidden';
    this.firstMask.style.cssText = 'position: absolute; box-shadow: 0 0 0 9999px rgba(18,150,219,.1); contain: style';
    this.mask.appendChild(this.firstMask);
  }

  setup(frameContainer: HTMLElement, context: EditContext): void {
    const frameDocument = context.document;
    const frameWindow = context.window;
    const childBody = frameDocument.body;
    let insertMask = false;
    let insertStyle = false;
    let style = frameDocument.createElement('style');
    style.id = this.id;
    style.innerText = '::selection { background: transparent; }';

    let unBindScroll: Subscription;

    fromEvent(childBody, 'mousedown').subscribe(startEvent => {
      this.selectedCells = [];
      if (insertStyle) {
        frameDocument.getSelection().removeAllRanges();
        frameDocument.head.removeChild(style);
        insertStyle = false;
      }
      if (insertMask) {
        frameContainer.removeChild(this.mask);
        insertMask = false;
        unBindScroll && unBindScroll.unsubscribe();
      }
      const startPaths = Array.from(startEvent.composedPath()) as Array<Node>;
      this.startCell = findElementByTagName(startPaths, ['td', 'th']) as HTMLTableCellElement;
      this.tableElement = findElementByTagName(startPaths, 'table') as HTMLTableElement;
      if (!this.startCell || !this.tableElement) {
        return;
      }

      this.cellMatrix = this.serialize(this.tableElement);


      unBindScroll = merge(...[
        'scroll',
        'resize'
      ].map(type => fromEvent(frameWindow, type))).subscribe(() => {
        if (this.endCell) {
          this.setSelectedCellsAndUpdateMaskStyle(this.startCell, this.endCell);
        }
      });


      const unBindMouseover = fromEvent(childBody, 'mouseover').subscribe(mouseoverEvent => {
        const paths = Array.from(mouseoverEvent.composedPath()) as Array<Node>;
        const currentTable = findElementByTagName(paths, 'table');
        if (currentTable !== this.tableElement) {
          return;
        }
        this.endCell = findElementByTagName(paths, ['td', 'th']) as HTMLTableCellElement || this.endCell;
        if (this.endCell) {
          if (this.endCell !== this.startCell) {
            frameDocument.head.appendChild(style);
            insertStyle = true;
          }
          if (!insertMask) {
            frameContainer.appendChild(this.mask);
            insertMask = true;
          }
          this.setSelectedCellsAndUpdateMaskStyle(this.startCell, this.endCell);
        }
      });

      const unBindMouseup = merge(...[
        'mouseleave',
        'mouseup'
      ].map(type => fromEvent(childBody, type))).subscribe(() => {
        unBindMouseover.unsubscribe();
        unBindMouseup.unsubscribe();
      });
    });

  }

  onSelectionChange(range: Range, context: EditContext): Range | Range[] {
    if (this.selectedCells.length) {
      return this.selectedCells.map(cell => {
        const range = context.document.createRange();
        range.selectNodeContents(cell);
        return range;
      });
    }
    return range;
  }

  onApply(range: Range[], formatter: Formatter, context: EditContext): boolean {
    if (formatter instanceof TableEditFormatter) {
      switch (formatter.type) {
        case TableEditActions.AddColumnToLeft:
          formatter.addColumnToLeft(this.cellMatrix, this.startPosition.columnIndex);
          break;
        case TableEditActions.AddColumnToRight:
          formatter.addColumnToRight(this.cellMatrix, this.endPosition.columnIndex);
          break;
        case TableEditActions.AddRowToTop:
          formatter.addRowToTop(this.cellMatrix, this.startPosition.rowIndex);
          break;
        case TableEditActions.AddRowToBottom:
          formatter.addRowToBottom(this.cellMatrix, this.endPosition.rowIndex);
          break;
        case TableEditActions.MergeCells:
          this.startCell = this.endCell = formatter.mergeCells(
            this.cellMatrix,
            this.startPosition.rowIndex,
            this.startPosition.columnIndex,
            this.endPosition.rowIndex,
            this.endPosition.columnIndex
          );
          break;
        case TableEditActions.SplitCells:
          const {startCell, endCell} = formatter.splitCells(
            this.cellMatrix,
            this.startPosition.rowIndex,
            this.startPosition.columnIndex,
            this.endPosition.rowIndex,
            this.endPosition.columnIndex
          );
          this.startCell = startCell;
          this.endCell = endCell;
          break;
        case TableEditActions.DeleteTopRow:
          formatter.deleteTopRow(this.cellMatrix, this.startPosition.rowIndex);
          break;
        case TableEditActions.DeleteBottomRow:
          formatter.deleteBottomRow(this.cellMatrix, this.endPosition.rowIndex);
          break;
        case TableEditActions.DeleteLeftColumn:
          formatter.deleteLeftColumn();
          break;
        case TableEditActions.DeleteRightColumn:
          formatter.deleteRightColumn();
          break;
      }
      return false;
    }
    return true;
  }

  onOutput(head: HTMLHeadElement, body: HTMLBodyElement): void {
    const style = head.querySelector('#' + this.id);
    if (style) {
      style.parentNode.removeChild(style);
    }
  }

  onApplied(): void {
    this.cellMatrix = this.serialize(this.tableElement);
    this.setSelectedCellsAndUpdateMaskStyle(this.startCell, this.endCell);
  }

  private setSelectedCellsAndUpdateMaskStyle(cell1: HTMLTableCellElement,
                                             cell2: HTMLTableCellElement) {

    const p1 = this.findCellPosition(cell1);
    const p2 = this.findCellPosition(cell2);

    const minRow = Math.min(p1.minRow, p2.minRow);
    const minColumn = Math.min(p1.minColumn, p2.minColumn);
    const maxRow = Math.max(p1.maxRow, p2.maxRow);
    const maxColumn = Math.max(p1.maxColumn, p2.maxColumn);

    const {startPosition, endPosition} = this.findSelectedRange(minRow, minColumn, maxRow, maxColumn);

    const startRect = startPosition.cellElement.getBoundingClientRect();
    const endRect = endPosition.cellElement.getBoundingClientRect();

    const firstCellRect = this.startCell.getBoundingClientRect();

    this.firstMask.style.width = firstCellRect.width + 'px';
    this.firstMask.style.height = firstCellRect.height + 'px';

    this.animate({
      left: this.mask.offsetLeft,
      top: this.mask.offsetTop,
      width: this.mask.offsetWidth,
      height: this.mask.offsetHeight
    }, {
      left: startRect.left,
      top: startRect.top,
      width: endRect.right - startRect.left,
      height: endRect.bottom - startRect.top
    }, {
      left: firstCellRect.left - startRect.left,
      top: firstCellRect.top - startRect.top,
      width: firstCellRect.width,
      height: firstCellRect.height
    });

    const selectedCells = this.cellMatrix.slice(startPosition.rowIndex, endPosition.rowIndex + 1).map(row => {
      return row.cells.slice(startPosition.columnIndex, endPosition.columnIndex + 1);
    }).reduce((a, b) => {
      return a.concat(b);
    }).map(item => item.cellElement);

    this.selectedCells = Array.from(new Set(selectedCells));
    this.startPosition = startPosition;
    this.endPosition = endPosition;
  }

  private animate(start: ElementPosition, target: ElementPosition, firstCellPosition: ElementPosition) {
    cancelAnimationFrame(this.animateId);
    function toInt(n: number) {
      return n < 0 ? Math.ceil(n) : Math.floor(n);
    }
    let step = 0;
    const maxStep = 6;
    const animate = () => {
      step++;
      const ratio = this.animateBezier.update(step / maxStep);
      const left = start.left + toInt((target.left - start.left) * ratio);
      const top = start.top + toInt((target.top - start.top) * ratio);
      const width = start.width + toInt((target.width - start.width) * ratio);
      const height = start.height + toInt((target.height - start.height) * ratio);

      this.mask.style.left = left + 'px';
      this.mask.style.top = top + 'px';
      this.mask.style.width = width + 'px';
      this.mask.style.height = height + 'px';

      this.firstMask.style.left = target.left - left + firstCellPosition.left + 'px';
      this.firstMask.style.top = target.top - top + firstCellPosition.top + 'px';
      if (step < maxStep) {
        this.animateId = requestAnimationFrame(animate);
      }
    };
    this.animateId = requestAnimationFrame(animate);
  }

  private findSelectedRange(minRow: number, minColumn: number, maxRow: number, maxColumn: number): {
    startPosition: CellPosition,
    endPosition: CellPosition
  } {
    const cellMatrix = this.cellMatrix;

    const x1 = -Math.max(...cellMatrix.slice(minRow, maxRow + 1).map(row => row.cells[minColumn].columnOffset));
    const x2 = Math.max(...cellMatrix.slice(minRow, maxRow + 1)
      .map(row => row.cells[maxColumn].cellElement.colSpan - (row.cells[maxColumn].columnOffset + 1)));
    const y1 = -Math.max(...cellMatrix[minRow].cells.slice(minColumn, maxColumn + 1).map(cell => cell.rowOffset));
    const y2 = Math.max(...cellMatrix[maxRow].cells.slice(minColumn, maxColumn + 1)
      .map(cell => cell.cellElement.rowSpan - (cell.rowOffset + 1)));

    if (x1 || y1 || x2 || y2) {
      return this.findSelectedRange(minRow + y1, minColumn + x1, maxRow + y2, maxColumn + x2);
    }

    return {
      startPosition: cellMatrix[minRow].cells[minColumn],
      endPosition: cellMatrix[maxRow].cells[maxColumn]
    }
  }

  private findCellPosition(cell: HTMLTableCellElement) {
    const cellMatrix = this.cellMatrix;
    let minRow: number, maxRow: number, minColumn: number, maxColumn: number;

    forA:for (let rowIndex = 0; rowIndex < cellMatrix.length; rowIndex++) {
      const cells = cellMatrix[rowIndex].cells;
      for (let colIndex = 0; colIndex < cells.length; colIndex++) {
        if (cells[colIndex].cellElement === cell) {
          minRow = rowIndex;
          minColumn = colIndex;
          break forA;
        }
      }
    }

    forB:for (let rowIndex = cellMatrix.length - 1; rowIndex > -1; rowIndex--) {
      const cells = cellMatrix[rowIndex].cells;
      for (let colIndex = cells.length - 1; colIndex > -1; colIndex--) {
        if (cells[colIndex].cellElement === cell) {
          maxRow = rowIndex;
          maxColumn = colIndex;
          break forB;
        }
      }
    }

    return {
      minRow,
      maxRow,
      minColumn,
      maxColumn
    }
  }

  private serialize(table: HTMLTableElement): RowPosition[] {
    const rows: RowPosition[] = [];

    function splitRows(rows: HTMLCollectionOf<HTMLTableRowElement>): RowPosition[] {
      return Array.from(rows).map(tr => {
        return {
          beforeRow: tr.previousElementSibling,
          afterRow: tr.nextElementSibling,
          rowElement: tr,
          cells: Array.from(tr.cells).map(cell => {
            return {
              rowElement: tr,
              beforeCell: cell.previousElementSibling,
              afterCell: cell.nextElementSibling,
              cellElement: cell,
              rowOffset: 0,
              columnOffset: 0
            }
          })
        }
      });
    }

    if (table.tHead) {
      rows.push(...splitRows(table.tHead.rows));
    }

    if (table.tBodies) {
      Array.from(table.tBodies).forEach(tbody => {
        rows.push(...splitRows(tbody.rows));
      });
    }
    if (table.tFoot) {
      rows.push(...splitRows(table.tFoot.rows));
    }
    let stop = false;
    let columnIndex = 0;
    const marks: string[] = [];
    do {
      stop = rows.map((row, rowIndex) => {
        const cell = row.cells[columnIndex];
        if (cell) {
          let mark: string;
          cell.rowIndex = rowIndex;
          cell.columnIndex = columnIndex;

          if (cell.columnOffset + 1 < cell.cellElement.colSpan) {
            mark = `${rowIndex}*${columnIndex + 1}`;
            if (marks.indexOf(mark) === -1) {
              row.cells.splice(columnIndex + 1, 0, {
                beforeCell: cell.beforeCell,
                afterCell: cell.afterCell,
                rowElement: row.rowElement,
                cellElement: cell.cellElement,
                columnOffset: cell.columnOffset + 1,
                rowOffset: cell.rowOffset
              });
              marks.push(mark);
            }
          }
          if (cell.rowOffset + 1 < cell.cellElement.rowSpan) {
            mark = `${rowIndex + 1}*${columnIndex}`;
            if (marks.indexOf(mark) === -1) {
              const nextRow = rows[rowIndex + 1];
              const newRowBeforeColumn = nextRow.cells[columnIndex - 1];
              const newRowAfterColumn = nextRow.cells[columnIndex];
              nextRow.cells.splice(columnIndex, 0, {
                beforeCell: newRowBeforeColumn ? newRowBeforeColumn.cellElement : null,
                afterCell: newRowAfterColumn ? newRowAfterColumn.cellElement : null,
                rowElement: rows[rowIndex + 1].rowElement,
                cellElement: cell.cellElement,
                columnOffset: cell.columnOffset,
                rowOffset: cell.rowOffset + 1
              });
              marks.push(mark);
            }
          }
          return true;
        }
        return false;
      }).indexOf(true) > -1;
      columnIndex++;
    } while (stop);
    return rows;
  }
}
