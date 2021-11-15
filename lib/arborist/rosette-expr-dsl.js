const ImmutableMap = require('immutable').Map;

class DslObjectBase {
  toJSON() {
    return _toJSON(this)
  }
}

function _toJSON(x) {
  if((x instanceof Expr) || (x instanceof Pattern)) {
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
  dslEval(primitives, fns, bindings) {
    throw new Error("Method 'dslEval()' must be implemented.");
  }
}

class VarExpr extends Expr {
  constructor(varName) {
    super()
    this.varName = varName
  }

  dslEval(primitives, fns, bindings) {
    if(bindings.has(this.varName)) {
      return bindings.get(this.varName)
    } else {
      throw new Error(`Variable ${this.varName} is not bound.`)
    }
  }
}

class ConstExpr extends Expr {
  constructor(value) {
    super()
    this.value = value
  }

  dslEval(primitives, fns, bindings) {
    return this.value
  }
}

class LetExpr extends Expr {
  constructor(varName, bindValue, rest) {
    super()
    if(!(bindValue instanceof Expr)) {
      throw new Error("bindValue must be an Expr.")
    }
    if(!(rest instanceof Expr)) {
      throw new Error("rest must be an Expr.")
    }
    this.varName = varName
    this.bindValue = bindValue
    this.rest = rest
  }

  dslEval(primitives, fns, bindings) {
    let val = this.bindValue.dslEval(primitives, fns, bindings)
    return this.rest.dslEval(primitives, fns, bindings.set(this.varName, val))
  }
}

class PrimitiveOpExpr extends Expr {
  constructor(op, args) {
    super()
    if(!args.every(x => x instanceof Expr)) {
      throw new Error("All arguments must be Exprs.")
    }
    this.op = op
    this.args = args
  }

  dslEval(primitives, fns, bindings) {
    if(!(this.op in primitives)) {
      throw new Error(`Unknown primitive operator ${this.op}`)
    }
    let args = this.args.map(x => x.dslEval(primitives, fns, bindings))
    return primitives[this.op](...args)
  }
}

class LambdaExpr extends Expr {
  constructor(param, body) {
    super()
    if(!(body instanceof Expr)) {
      throw new Error("body must be an Expr. Instead it is a: " + typeof body + ". param: " + param)
    }
    this.param = param
    this.body = body // must be simple
  }

  dslEval(primitives, fns, bindings) {
    let paramName = this.param
    let body = this.body
    return function(theArg) {
      return body.dslEval(primitives, fns, bindings.set(paramName, theArg))
    }
  }
}

class CallExpr extends Expr {
  constructor(name, args) {
    super()
    if(!args.every(x => x instanceof Expr)) {
      throw new Error("All arguments must be Exprs.")
    }
    this.name = name
    this.args = args
  }

  dslEval(primitives, fns, bindings) {
    let args = this.args.map(x => x.dslEval(primitives, fns, bindings))
    return evalFunction(primitives, fns, this.name, args)
  }
}


class Pattern extends DslObjectBase {
  match(arg) {
    throw new Error("Method 'match()' must be implemented.");
  }
}

class WildcardPattern extends Pattern {
  match(arg) {
    return {}
  }
}

class ConstPattern extends Pattern {
  constructor(value) {
    super()
    this.value = value
  }

  match(arg) {
    if(this.value == arg) {
      return {}
    } else {
      return null
    }
  }
}

class BindingPattern extends Pattern {
  constructor(name) {
    super()
    this.name = name
  }

  match(arg) {
    let binding = {}
    binding[this.name] = arg
    return binding
  }
}

function isSubset(smaller, bigger) {
  for (let elem of smaller) {
      if (!bigger.has(elem)) {
          return false
      }
  }
  return true
}

function dictMatch(patDict, argDict) {
  const patKeys = new Set(Object.keys(patDict))
  const argKeys = new Set(Object.keys(argDict))
  if(!isSubset(patKeys, argKeys) || !isSubset(argKeys, patKeys)) {
    return null
  }
  const keys = [...patKeys]
  return checkMatch(keys.map(k => patDict[k]), keys.map(k => argDict[k]))
}

function vecMatch(patVec, argVec) {
  if(patVec.length != argVec.length) {
    return null
  }
  return checkMatch(patVec, argVec)
}

class DictionaryPattern extends Pattern {
  constructor(namesPatternsDict) {
    super()
    this.namesPatternsDict = namesPatternsDict
  }

  match(arg) {
    if(arg.constructor == Object) {
      return dictMatch(this.namesPatternsDict, arg)
    } else {
      return null
    }
  }
}

class VectorPattern extends Pattern {
  constructor(patterns) {
    super()
    this.patterns = patterns
  }

  match(arg) {
    if(Array.isArray(arg)) {
      return vecMatch(this.patterns, arg)
    } else {
      return null
    }
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


function dictBind(...names) {
  return new DictionaryPattern(Object.fromEntries(names.map(name => [name, new BindingPattern(name)])))
}

function vecBind(...names) {
  return new VectorPattern(names.map(name => new BindingPattern(name)))
}

function theVar(name) {
  return new VarExpr(name)
}

function c(c) {
  return new ConstExpr(c)
}

function op(op, ...args) {
  return new PrimitiveOpExpr(op, args)
}



// Interpreter



function objectToImmutableMap(obj) {
  return new ImmutableMap(obj)
}

function mergeInto(target, source) {
  for(let [key, value] of Object.entries(source)) {
    if(key in target) {
      throw new Error(`Duplicate binding pattern: ${key}`)
    }
    target[key] = value
  }
}

function checkMatch(patterns, args) {
  let bindings = {}
  for(let i = 0; i < patterns.length; i++) {
    let pattern = patterns[i]
    let newBindings = pattern.match(args[i])
    if(!newBindings) {
      return null
    } else {
      mergeInto(bindings, newBindings)
    }
  }
  return bindings
}

function tryEvalRules(primitives, fns, rules, args, fName) {
  for(let rule of rules) {
    let bindings = checkMatch(rule.patterns, args)
    if(bindings) {
      return rule.rhs.dslEval(primitives, fns, objectToImmutableMap(bindings))
    }
  }
  throw new Error(`No rule for function "${fName}" matched ${JSON.stringify(args)}`)
}


function evalFunctionImpl(primitives, fns, f, args, fName) {
  if(f.numParams != args.length) {
    throw new Error(`Function ${f.name} expects ${f.numParams} args, got ${args.length}`)
  }
  return tryEvalRules(primitives, fns, f.rules, args, fName)
}

function evalFunction(primitives, fns, fName, args) {
  let f = fns[fName]
  if(!f) {
    throw new Error(`Function ${fName} not found`)
  }
  return evalFunctionImpl(primitives, fns, f, args, fName)
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
  evalFunction,
  helpers: {
    dictBind,
    vecBind,
    theVar,
    c,
    op,
  }
}