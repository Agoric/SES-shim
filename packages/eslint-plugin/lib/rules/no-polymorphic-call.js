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
            context.report(node, 'Do not use polymorphic calls (unless you truly mean to)')
          }
        }
    },
}
