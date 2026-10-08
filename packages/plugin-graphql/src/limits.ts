import {
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql'

export const DEFAULT_DEPTH = 7

/** How many levels of fields a selection goes down; introspection (`__schema`…) is not counted. */
function depthOf(
  selections: SelectionSetNode,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  visited: Set<string>,
): number {
  let deepest = 0
  for (const selection of selections.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith('__')) continue
      const below = selection.selectionSet ? depthOf(selection.selectionSet, fragments, visited) : 0
      deepest = Math.max(deepest, 1 + below)
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      deepest = Math.max(deepest, depthOf(selection.selectionSet, fragments, visited))
    } else {
      const name = selection.name.value
      const fragment = fragments.get(name)
      // A fragment that spreads itself is reported by the standard rules.
      if (!fragment || visited.has(name)) continue
      visited.add(name)
      deepest = Math.max(deepest, depthOf(fragment.selectionSet, fragments, visited))
      visited.delete(name)
    }
  }
  return deepest
}

/** Refuses operations that go more than `max` levels of fields deep. */
export function depthLimit(max: number): ValidationRule {
  return (context) => {
    const fragments = new Map(
      context
        .getDocument()
        .definitions.filter((d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION)
        .map((d) => [d.name.value, d]),
    )
    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet, fragments, new Set())
        if (depth > max)
          context.reportError(
            new GraphQLError(`This query is ${depth} levels deep; at most ${max} (limits.depth)`, {
              nodes: node,
              extensions: { code: 'QUERY_TOO_DEEP' },
            }),
          )
      },
    }
  }
}
