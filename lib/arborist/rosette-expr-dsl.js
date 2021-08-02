
class DslObjectBase {
  toJSON() {
    return _toJSON(this)
  }
}

function _toJSON(x) {
  if(x instanceof DslObjectBase) {
    let d = {}
    d[x.constructor.name] = _toJSON(Object.fromEntries(Object.entries(x)))
    return d
  } else if(x instanceof Array) {
    return x.map(y => _toJSON(y))
  } else if(x.constructor == Object) {
    return Object.fromEntries(Object.entries(x).map(([name, val]) => [name, _toJSON(val)]))
  } else {
    return x
  }
}

class Expr extends DslObjectBase {
  
}

class VarExpr extends Expr {
  constructor(varName) {
    super()
    this.varName = varName
  }
}

class ConstExpr extends Expr {
  constructor(value) {
    super()
    this.value = value
  }
}

class LetExpr extends Expr {
  constructor(varName, bindValue, rest) {
    super()
    this.varName = varName
    this.bindValue = bindValue
    this.rest = rest
  }
}

class PrimitiveOpExpr extends Expr {
  constructor(op, args) {
    super()
    this.op = op
    this.args = args
  }
}

class LambdaExpr extends Expr {
  constructor(param, body) {
    super()
    this.param = param
    this.body = body // must be simple
  }
}

class CallExpr extends Expr {
  constructor(name, args) {
    super()
    this.name = name
    this.args = args
  }
}


class Pattern extends DslObjectBase {
}

class WildcardPattern extends Pattern {

}

class ConstPattern extends Pattern {
  constructor(value) {
    super()
    this.value = value
  }
}

class BindingPattern extends Pattern {
  constructor(name) {
    super()
    this.name = name
  }
}

class DictionaryPattern extends Pattern {
  constructor(namesPatternsDict) {
    super()
    this.namesPatternsDict = namesPatternsDict
  }
}

class VectorPattern extends Pattern {
  constructor(patterns) {
    super()
    this.patterns = patterns
  }
}

class FunctionRule extends DslObjectBase  {
  constructor(patterns, rhs) {
    super()
    this.patterns = patterns
    this.rhs = rhs
  }
}

class FunctionDef extends DslObjectBase  {
  constructor(numParams, rules) {
    super()
    this.numParams = numParams
    this.rules = rules
  }
}


function evalFunction(primitives, fns, fName, args) {
  // TODO: Implement interpreter. Copy over from Racket.
  return null
}

module.exports = {
  Expr, 
  VarExpr, 
  ConstExpr,
  LetExpr,
  PrimitiveOpExpr,
  LambdaExpr,
  CallExpr,
  Pattern,
  ConstPattern,
  WildcardPattern,
  BindingPattern,
  DictionaryPattern,
  VectorPattern,
  FunctionRule,
  FunctionDef,
  evalFunction
}