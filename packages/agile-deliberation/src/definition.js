// Copyright 2026 The Google Research Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// Modified by Compor, 2026-11-05. JavaScript port of Definition.copy,
// update_signals and collect_leaf_signals; immutable values replace Python objects.
// Source and full license: third_party/google-research/agile_deliberation/.

export function copyDefinition(definition) {
  return { ...definition, signals: definition.signals.map(copyDefinition) };
}

export function updateSignals(definition, signals, signalType) {
  const additions = signals.filter(signal => signal.concept || signal.description)
    .map(signal => ({ ...copyDefinition(signal), signalType }));
  return { ...copyDefinition(definition), signals: [...definition.signals.map(copyDefinition), ...additions] };
}

export function collectLeafSignals(definition) {
  return definition.signals.length
    ? definition.signals.flatMap(collectLeafSignals)
    : [definition];
}

export function criterionDefinition(criterion) {
  let definition = { concept: criterion.id, description: criterion.statement, signalType: null, signals: [] };
  for (const type of ['necessary', 'positive', 'negative']) {
    definition = updateSignals(definition, criterion.signals[type].map((description, index) => ({
      concept: `${criterion.id}/${type}/${index}`, description, signalType: type, signals: [],
    })), type);
  }
  return definition;
}
