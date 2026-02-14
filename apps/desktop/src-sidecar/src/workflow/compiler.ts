// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowValidationReport,
} from '@cowork/shared';

export interface CompiledWorkflow {
  definition: WorkflowDefinition;
  startNodeId: string;
  outgoing: Map<string, WorkflowEdge[]>;
  incomingCount: Map<string, number>;
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!definition.name?.trim()) {
    errors.push('Workflow name is required.');
  }

  if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
    errors.push('Workflow must include at least one node.');
  }

  const nodeIds = new Set<string>();
  for (const node of definition.nodes || []) {
    if (!node.id?.trim()) {
      errors.push('Every node must have a non-empty id.');
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  const startNodes = (definition.nodes || []).filter((n) => n.type === 'start');
  const endNodes = (definition.nodes || []).filter((n) => n.type === 'end');

  if (startNodes.length === 0) {
    errors.push('Workflow requires a start node.');
  }
  if (startNodes.length > 1) {
    warnings.push('Multiple start nodes detected; the first one will be used.');
  }
  if (endNodes.length === 0) {
    warnings.push('Workflow has no end node; runs will end when no matching edge is found.');
  }

  for (const edge of definition.edges || []) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge ${edge.id} references unknown source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge ${edge.id} references unknown target node: ${edge.to}`);
    }
    if (edge.condition === 'custom' && !edge.expression) {
      errors.push(`Edge ${edge.id} uses custom condition without an expression.`);
    }
  }

  if ((definition.triggers || []).length === 0) {
    warnings.push('Workflow has no triggers; it can only run manually via API/tool.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function compileWorkflowDefinition(definition: WorkflowDefinition): CompiledWorkflow {
  const report = validateWorkflowDefinition(definition);
  if (!report.valid) {
    throw new Error(`Workflow validation failed: ${report.errors.join(' | ')}`);
  }

  const startNode = definition.nodes.find((node) => node.type === 'start') || definition.nodes[0];
  if (!startNode) {
    throw new Error('Workflow has no executable nodes.');
  }

  const outgoing = new Map<string, WorkflowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of definition.nodes) {
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of definition.edges || []) {
    const edges = outgoing.get(edge.from);
    if (edges) {
      edges.push(edge);
    }
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  }

  return {
    definition,
    startNodeId: startNode.id,
    outgoing,
    incomingCount,
  };
}
