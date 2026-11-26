// 실행 취소·다시 실행. 바뀐 장면을 통째로 적어 두는 방식(요소 수백 개까지 충분히 가벼움).
// 새로 기록하면 다시 실행 목록은 비운다.
export class History {
  constructor(limit = 200) { this.limit = limit; this.undoStack = []; this.redoStack = []; this.current = null; }
  reset(elements) { this.undoStack = []; this.redoStack = []; this.current = snap(elements); }
  record(elements) {
    const s = snap(elements);
    if (s === this.current) return false;
    if (this.current !== null) this.undoStack.push(this.current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.current = s;
    this.redoStack = [];
    return true;
  }
  undo() {
    if (!this.undoStack.length) return null;
    this.redoStack.push(this.current);
    this.current = this.undoStack.pop();
    return JSON.parse(this.current);
  }
  redo() {
    if (!this.redoStack.length) return null;
    this.undoStack.push(this.current);
    this.current = this.redoStack.pop();
    return JSON.parse(this.current);
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
const snap = (els) => JSON.stringify(els);
