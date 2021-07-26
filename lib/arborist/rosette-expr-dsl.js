
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
  constructor(params, body) {
    super()
    this.params = params
    this.body = body
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

const constraintInterpretation = new FunctionDef(1, [
  new FunctionRule(
    [new DictionaryPattern({"wildcardMajor": new WildcardPattern()})],
    new LambdaExpr(["v"], new ConstExpr(true))
  ),
  new FunctionRule(
    [new DictionaryPattern({"exactly": new BindingPattern("cv")})],
    new LambdaExpr(["v"], new PrimitiveOpExpr("equal?", [new VarExpr("v"), new VarExpr("cv")]))
  ),
])

const npmConsistency = new FunctionDef(0, [new FunctionRule([], new LambdaExpr(["v1", "v2"], new ConstExpr(true)))])

module.exports = {
  Expr, 
  VarExpr, 
  ConstExpr,
  LetExpr,
  PrimitiveOpExpr,
  LambdaExpr,
  Pattern,
  ConstPattern,
  WildcardPattern,
  BindingPattern,
  DictionaryPattern,
  FunctionRule,
  FunctionDef,
  constraintInterpretation,
  npmConsistency
}