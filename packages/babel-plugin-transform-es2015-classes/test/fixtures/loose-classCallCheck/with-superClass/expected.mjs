function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

let B = function B() {};

let A =
/*#__PURE__*/
function (_B) {
  _inheritsLoose(A, _B);

  function A(track) {
    var _this;

    if (track !== undefined) _this = _B.call(this, track) || this;else _this = _B.call(this) || this;
    return _this;
  }

  return A;
}(B);
