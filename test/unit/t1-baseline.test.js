import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMeta } from '../../packages/shared/src/project-meta.js';

test('project metadata is defined', () => {
  assert.equal(projectMeta.name, 'fpl-scraper');
  assert.equal(projectMeta.architecture, 'apps-packages');
});
