"use strict"

module.exports = {
    meta: {
        docs: {
            description:
                "disallow polymorphic function calls e.g.: 'array.slice()'",
            category: "Possible Security Errors",
            recommended: true,
            url:
                "https://github.com/endojs/endo/blob/master/packages/eslint-plugin/lib/rules/no-polymorphic-call.js",
        },
        type: "problem",
        fixable: null,
        schema: [],
        supported: true,
    },
    create (context) {
        return {
          CallExpression(node) {
            if (node.callee.type !== 'MemberExpression') {
              return
            }
            const reportHint = prepareMemberExpressionHint(node.callee)
            context.report(node, `Polymorphic call: "${reportHint}". May be vulnerable to corruption or trap`)
          }
        }
    },
}

function prepareMemberExpressionHint (node) {
  const { object, property, computed } = node
  let objectHint
  let propertyHint
  if (object.type === 'Identifier') {
    objectHint = object.name
  } else if (object.type === 'MemberExpression') {
    objectHint = prepareMemberExpressionHint(object)
  } else {
    objectHint = `[[${object.type}]]`
  }
  if (property.type === 'Identifier') {
    if (computed) {
      propertyHint = `[${property.name}]`
    } else {
      propertyHint = property.name
    }
  } else {
    propertyHint = `[[${property.type}]]`
  }
  return `${objectHint}.${propertyHint}`
}