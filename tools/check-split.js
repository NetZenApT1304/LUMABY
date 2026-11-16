// The app's code is split into classic scripts (js/*.js) that index.html
// loads in order and that share one global scope. Moving code between them
// can break things silently, so run this after any such change:
//
//   npm install && node tools/check-split.js
//
// It reports code that runs at load time but uses something declared in a
// later file, a function re-assigned ("patched") before a later file
// declares it (the declaration would undo the patch), and names declared in
// more than one file.
const acorn = require('acorn'), walk = require('acorn-walk'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const files = process.argv.length > 2 ? process.argv.slice(2)
  : [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => path.join(root, m[1]));
const parsed = files.map(f => ({ f, ast: acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, sourceType: 'script', locations: true }) }));
const declaredIn = {};   // name -> [{file index, kind}]
parsed.forEach(({ ast }, i) => {
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration') (declaredIn[st.id.name] ||= []).push({ i, kind: 'function', line: st.loc.start.line });
    else if (st.type === 'ClassDeclaration') (declaredIn[st.id.name] ||= []).push({ i, kind: 'class', line: st.loc.start.line });
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of names(d.id)) (declaredIn[n] ||= []).push({ i, kind: st.kind, line: st.loc.start.line });
  }
});
function names(p) { if (p.type === 'Identifier') return [p.name]; if (p.type === 'ObjectPattern') return p.properties.flatMap(x => names(x.value || x.argument)); if (p.type === 'ArrayPattern') return p.elements.filter(Boolean).flatMap(names); if (p.type === 'RestElement') return names(p.argument); if (p.type === 'AssignmentPattern') return names(p.left); return []; }
const problems = [];
// duplicates across files
for (const [n, ds] of Object.entries(declaredIn)) { const fsets = new Set(ds.map(d => d.i)); if (fsets.size > 1) problems.push(`"${n}" declared in several files: ${ds.map(d => path.relative(root, files[d.i]) + ':' + d.line).join(', ')}`); }
// identifiers used at load time (outside function bodies) and top-level assignments
parsed.forEach(({ f, ast }, i) => {
  const visitLoadTime = (node) => {
    walk.recursive(node, null, {
      Function() { /* body runs later; skip */ },
      ArrowFunctionExpression() {},
      FunctionExpression() {},
      FunctionDeclaration() {},
      Identifier(n) {
        const ds = declaredIn[n.name]; if (!ds) return;
        if (ds.every(d => d.i > i)) problems.push(`${path.relative(root, f)}:${n.loc.start.line} uses "${n.name}" at load time, but it's declared later in ${path.relative(root, files[ds[0].i])}`);
      },
      CallExpression(n, st, c) {
        // immediately-invoked functions run at load time: check their bodies too
        const cal = n.callee.type === 'CallExpression' ? null : n.callee;
        if (cal && (cal.type === 'FunctionExpression' || cal.type === 'ArrowFunctionExpression')) c(cal.body, st);
        else c(n.callee, st);
        n.arguments.forEach(a => c(a, st));
      },
      MemberExpression(n, st, c) { c(n.object, st); if (n.computed) c(n.property, st); },
      Property(n, st, c) { if (n.computed) c(n.key, st); c(n.value, st); },
      AssignmentExpression(n, st, c) {
        if (n.left.type === 'Identifier') {
          const ds = declaredIn[n.left.name] || [];
          const fnLater = ds.filter(d => d.kind === 'function' && d.i > i);
          if (fnLater.length) problems.push(`${path.relative(root, f)}:${n.loc.start.line} reassigns "${n.left.name}", but its function declaration is in a later file ${path.relative(root, files[fnLater[0].i])} (it would undo this)`);
        }
        c(n.right, st); if (n.left.type !== 'Identifier') c(n.left, st);
      },
    });
  };
  for (const st of ast.body) { if (st.type !== 'FunctionDeclaration') visitLoadTime(st); }
});
console.log(problems.length ? problems.join('\n') : `OK (${files.length} files): no cross-file load-time references, overridden patches or duplicate declarations`);
process.exit(problems.length ? 1 : 0);
