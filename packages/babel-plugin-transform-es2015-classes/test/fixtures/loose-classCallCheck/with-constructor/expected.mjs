let A = function A() {
  console.log('a');
};

let B =
/*#__PURE__*/
function () {
  function B() {}

  var _proto = B.prototype;

  _proto.b = function b() {
    console.log('b');
  };

  return B;
}();
