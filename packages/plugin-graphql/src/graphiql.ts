/** Versions of GraphiQL and React loaded from unpkg, pinned. */
const GRAPHIQL = 'graphiql@3.8.3'
const REACT = '18.3.1'

/**
 * GraphiQL, to try queries in the browser. Requests go to this same address with the browser's
 * cookies, so a logged-in admin reads what they may read.
 */
export function graphiqlPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>GraphiQL · Easy CMS</title>
<link rel="stylesheet" href="https://unpkg.com/${GRAPHIQL}/graphiql.min.css">
<style>html, body, #graphiql { height: 100%; margin: 0; }</style>
</head>
<body>
<div id="graphiql">Loading GraphiQL…</div>
<script crossorigin src="https://unpkg.com/react@${REACT}/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@${REACT}/umd/react-dom.production.min.js"></script>
<script crossorigin src="https://unpkg.com/${GRAPHIQL}/graphiql.min.js"></script>
<script>
  const fetcher = GraphiQL.createFetcher({ url: location.pathname })
  ReactDOM.createRoot(document.getElementById('graphiql')).render(
    React.createElement(GraphiQL, {
      fetcher,
      defaultEditorToolsVisibility: true,
      defaultQuery: '# Easy CMS GraphQL API. Ctrl+Space suggests fields; Ctrl+Enter runs.\\n{\\n  me {\\n    email\\n  }\\n}\\n',
    }),
  )
</script>
</body>
</html>
`
}
