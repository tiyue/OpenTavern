import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const moduleContracts = [
  {
    file: 'chat/61-message-display-model.js',
    factory: 'createMessageDisplayModel',
    symbols: ['createMessageDisplayModel', 'prepareMessageDisplay'],
    exports: ['prepare', 'prepareOptions'],
    dependencyCall: {
      file: 'chat/61-message-display-model.js',
      callee: 'createMessageDisplayModel',
      keys: [
        'formatMessage', 'isolatePrimaryStageContent', 'renderDeclarativeTemplateSubset',
        'getMvuDataForMessage', 'getMvuWorldInfoEntries', 'getMvuDiagnostics',
        'stripMvuControlBlocks', 'stripDreamControlWrappers', 'getSecondStageCodeProtectionMask',
        'isSecondStageRangeCodeProtected', 'parseSecondStageOptions', 'renderOptionChoices',
        'renderStaticMessage', 'sanitizeStatusBarHtml', 'highlightDialogue', 'escapeHtml'
      ]
    },
    integrations: [
      { file: 'chat/61-message-content-render.js', call: 'prepareMessageDisplay' },
      { file: 'chat/61-message-options-render.js', property: 'messageDisplayModel.prepareOptions' },
      { file: 'generation/52-generation-message-lifecycle.js', call: 'prepareMessageDisplay' },
      { file: 'generation/52-generation-stream-animation.js', call: 'prepareMessageDisplay' }
    ],
    order: [
      'chat/61-message-text-format.js',
      'chat/61-message-display-model.js',
      'chat/61-message-content-render.js'
    ]
  },
  {
    file: 'generation/50-generation-transport-module.js',
    factory: 'createGenerationTransport',
    symbols: ['createGenerationTransport'],
    exports: ['request', 'readStream', 'readJson', 'buildCompletion'],
    dependencyCall: {
      file: 'generation/50-generation-integrations.js',
      callee: 'createGenerationTransport',
      keys: ['fetch', 'clock', 'stateController', 'settings', 'helpers']
    },
    integrations: [
      { file: 'generation/50-generation-response-stream.js', call: 'createGenerationTransport' },
      { file: 'generation/50-generation-response-stream.js', property: 'createGenerationResponseTransport().readStream' },
      { file: 'generation/50-generation-response-stream.js', property: 'createGenerationResponseTransport().readJson' },
      { file: 'generation/50-generation-integrations.js', property: 'transport.request' }
    ],
    order: [
      'generation/50-generation-api-request.js',
      'generation/50-generation-stream-state.js',
      'generation/50-generation-transport-module.js',
      'generation/50-generation-response-stream.js',
      'generation/50-generation-integrations.js'
    ]
  }
];

function parseSource(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

function hasModifier(node, kind) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : null;
  return !!modifiers && modifiers.some((modifier) => modifier.kind === kind);
}

function isModuleSource(sourceFile) {
  return sourceFile.statements.some((statement) =>
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isExportAssignment(statement) ||
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  );
}

function createScope(id, functionOrScript, parent = null) {
  return { id, functionOrScript, parent, declarations: new Map() };
}

function nearestFunctionOrScript(scope) {
  let current = scope;
  while (current && !current.functionOrScript) current = current.parent;
  return current;
}

function declare(scope, name, node, sourceFile, kind) {
  if (!name) return;
  const declarations = scope.declarations.get(name) || [];
  declarations.push({ node, sourceFile, kind });
  scope.declarations.set(name, declarations);
}

function bindingNames(name, output = []) {
  if (!name) return output;
  if (ts.isIdentifier(name)) output.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    name.elements.forEach((element) => bindingNames(element.name, output));
  }
  return output;
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node);
}

function isScopeBoundary(node) {
  return isFunctionLike(node) || ts.isBlock(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node) ||
    ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isCatchClause(node);
}

function location(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}`;
}

export function findDuplicateDeclarations(sources) {
  const parsed = sources.map((source) => {
    const sourceFile = parseSource(source.file, source.text);
    return { file: source.file, text: source.text, sourceFile, module: isModuleSource(sourceFile) };
  });
  const sharedScriptScope = createScope('bundle-script', true);
  const allScopes = [sharedScriptScope];

  function walk(entry, node, scope) {
    let nextScope = scope;
    if (isFunctionLike(node)) {
      nextScope = createScope(`${entry.file}:${node.pos}:function`, true, scope);
      allScopes.push(nextScope);
      if (ts.isFunctionExpression(node) && node.name) declare(nextScope, node.name.text, node.name, entry.sourceFile, 'function');
    } else if (ts.isBlock(node) && node.parent && isFunctionLike(node.parent) && node.parent.body === node) {
      nextScope = scope;
    } else if (isScopeBoundary(node)) {
      nextScope = createScope(`${entry.file}:${node.pos}:${node.kind}`, false, scope);
      allScopes.push(nextScope);
    }

    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
      declare(scope, node.name && ts.isIdentifier(node.name) ? node.name.text : '', node.name || node, entry.sourceFile, 'declaration');
    } else if (ts.isVariableDeclaration(node) && !(node.parent && ts.isCatchClause(node.parent))) {
      const lexical = (ts.getCombinedNodeFlags(node) & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
      const target = lexical ? nextScope : nearestFunctionOrScript(nextScope);
      bindingNames(node.name).forEach((name) => declare(target, name, node.name, entry.sourceFile, 'variable'));
    } else if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      if (clause.name) declare(nextScope, clause.name.text, clause.name, entry.sourceFile, 'import');
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) declare(nextScope, bindings.name.text, bindings.name, entry.sourceFile, 'import');
      if (bindings && ts.isNamedImports(bindings)) {
        bindings.elements.forEach((element) => declare(nextScope, element.name.text, element.name, entry.sourceFile, 'import'));
      }
    }

    ts.forEachChild(node, (child) => walk(entry, child, nextScope));
  }

  parsed.forEach((entry) => {
    const rootScope = entry.module ? createScope(`${entry.file}:module`, true) : sharedScriptScope;
    if (entry.module) allScopes.push(rootScope);
    walk(entry, entry.sourceFile, rootScope);
  });

  const errors = [];
  const duplicateReports = new Map();
  const rootScopes = [sharedScriptScope, ...allScopes.filter((scope) => scope.id.endsWith(':module'))];
  rootScopes.forEach((scope) => {
    scope.declarations.forEach((declarations, name) => {
      if (declarations.length < 2) return;
      const key = `${scope.id}:${name}`;
      duplicateReports.set(key, `Duplicate top-level symbol "${name}" in ${scope.id}: ${declarations.map((item) => location(item.sourceFile, item.node)).join(', ')}`);
    });
  });

  errors.push(...duplicateReports.values());
  return errors;
}

function topLevelSymbols(sourceFile) {
  const symbols = new Map();
  sourceFile.statements.forEach((statement) => {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
      if (statement.name && ts.isIdentifier(statement.name)) symbols.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((declaration) => {
        bindingNames(declaration.name).forEach((name) => symbols.set(name, declaration));
      });
    }
  });
  return symbols;
}

function returnedObjectKeys(sourceFile, functionName) {
  const symbols = topLevelSymbols(sourceFile);
  const declaration = symbols.get(functionName);
  if (!declaration || !ts.isFunctionDeclaration(declaration) || !declaration.body) return new Set();
  const keys = new Set();
  declaration.body.statements.forEach((statement) => {
    if (!ts.isReturnStatement(statement) || !statement.expression || !ts.isObjectLiteralExpression(statement.expression)) return;
    statement.expression.properties.forEach((property) => {
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) keys.add(property.name.getText(sourceFile));
    });
  });
  return keys;
}

function objectKeys(objectLiteral) {
  const keys = new Set();
  if (!objectLiteral) return keys;
  objectLiteral.properties.forEach((property) => {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) keys.add(property.name.getText(sourceFileForNode(property)));
  });
  return keys;
}

function sourceFileForNode(node) {
  let current = node;
  while (current.parent) current = current.parent;
  return current;
}

function callObject(sourceFile, calleeName, requiredTopKeys = []) {
  let match = null;
  function visit(node) {
    if (match) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === calleeName && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const keys = objectKeys(node.arguments[0]);
      if (requiredTopKeys.every((key) => keys.has(key))) match = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return match;
}

function hasCall(sourceFile, name) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found = true;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasPropertyCall(sourceFile, propertyPath) {
  function callPath(node) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return `${callPath(node.expression)}.${node.name.text}`;
    if (ts.isCallExpression(node)) return `${callPath(node.expression)}()`;
    return '';
  }
  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && callPath(node.expression) === propertyPath) found = true;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function checkModuleContracts(manifest, sourceMap) {
  const errors = [];
  const positions = new Map();
  manifest.forEach((file, index) => {
    if (!positions.has(file)) positions.set(file, []);
    positions.get(file).push(index);
  });
  positions.forEach((indexes, file) => {
    if (indexes.length > 1) errors.push(`Duplicate manifest registration "${file}" at manifest indexes ${indexes.map((index) => index + 1).join(', ')}`);
  });

  moduleContracts.forEach((contract) => {
    const required = [contract.file, contract.dependencyCall.file, ...contract.integrations.map((item) => item.file), ...contract.order];
    new Set(required).forEach((file) => {
      if (!positions.has(file)) errors.push(`Missing module dependency "${file}" required by ${contract.factory}`);
    });

    for (let index = 1; index < contract.order.length; index++) {
      const before = contract.order[index - 1];
      const after = contract.order[index];
      if (positions.has(before) && positions.has(after) && positions.get(before)[0] > positions.get(after)[0]) {
        errors.push(`Assembly order error: ${before} must precede ${after} for ${contract.factory}`);
      }
    }

    const sourceFile = sourceMap.get(contract.file);
    if (!sourceFile) return;
    const symbols = topLevelSymbols(sourceFile);
    contract.symbols.forEach((symbol) => {
      if (!symbols.has(symbol)) errors.push(`Missing module symbol "${symbol}" in ${contract.file}`);
    });
    const exported = returnedObjectKeys(sourceFile, contract.factory);
    contract.exports.forEach((name) => {
      if (!exported.has(name)) errors.push(`Missing module export "${name}" returned by ${contract.factory} in ${contract.file}`);
    });

    const dependencyFile = sourceMap.get(contract.dependencyCall.file);
    const dependencyObject = dependencyFile && callObject(dependencyFile, contract.dependencyCall.callee, contract.exports.includes('prepare') ? [] : ['fetch']);
    if (dependencyFile) {
      const keys = objectKeys(dependencyObject);
      contract.dependencyCall.keys.forEach((key) => {
        if (!keys.has(key)) errors.push(`Missing module dependency "${key}" in ${contract.dependencyCall.callee}(...) at ${contract.dependencyCall.file}`);
      });
    }

    contract.integrations.forEach((integration) => {
      const integrationSource = sourceMap.get(integration.file);
      if (!integrationSource) return;
      const present = integration.call ? hasCall(integrationSource, integration.call) : hasPropertyCall(integrationSource, integration.property);
      if (!present) errors.push(`Missing module integration ${integration.call || integration.property} in ${integration.file}`);
    });
  });
  return errors;
}

export function checkAppContracts(options = {}) {
  const root = options.root || defaultRoot;
  const manifest = options.manifest || JSON.parse(fs.readFileSync(path.join(root, 'src/app/manifest.json'), 'utf8'));
  const sources = options.sources || manifest.map((file) => ({
    file,
    text: fs.readFileSync(path.join(root, 'src/app', file), 'utf8')
  }));
  const sourceMap = new Map(sources.map((source) => [source.file, parseSource(source.file, source.text)]));
  return [
    ...findDuplicateDeclarations(sources),
    ...checkModuleContracts(manifest, sourceMap)
  ];
}

export function main() {
  const errors = checkAppContracts();
  if (errors.length) {
    console.error(`App contract check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('App contracts passed: lexical declarations, T07/T08 interfaces, dependencies and assembly order.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
