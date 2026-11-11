
  // 1. Circular Dependency Check (Requirement 4)

export function hasCircularDependency(edges, serviceId, dependsOnId) {
  if (Number(serviceId) === Number(dependsOnId)) return true;

  // Build adjacency list: service -> [services it depends on]
  const adj = new Map();
  for (const edge of edges) {
    if (!adj.has(edge.service_id)) adj.set(edge.service_id, []);
    adj.get(edge.service_id).push(edge.depends_on_id);
  }

  // Check if dependsOnId already transitively depends on serviceId
  const visited = new Set();
  const stack = [Number(dependsOnId)];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === Number(serviceId)) return true;
    if (!visited.has(current)) {
      visited.add(current);
      const neighbors = adj.get(current) || [];
      for (const next of neighbors) {
        stack.push(next);
      }
    }
  }
  return false;
}

/**
 * 2. Dependency Impact Analysis (Requirement 4 & Smart Requirement)
 * Traverses downstream dependents when a root service is degraded/unavailable.
 * Returns { directlyAffected: Service[], potentiallyAffected: Service[] }
 */
export function calculateDependencyImpact(services, dependencies, failingServiceId) {
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  // Reverse adjacency list: upstream_id -> [downstream_service_ids that depend on it]
  const downstreamMap = new Map();
  for (const dep of dependencies) {
    if (!downstreamMap.has(dep.depends_on_id)) {
      downstreamMap.set(dep.depends_on_id, []);
    }
    downstreamMap.get(dep.depends_on_id).push(dep.service_id);
  }

  const directlyAffected = [];
  const potentiallyAffected = [];
  const visited = new Set([Number(failingServiceId)]);

  // BFS Queue: { id, depth }
  const queue = [{ id: Number(failingServiceId), depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    const dependents = downstreamMap.get(id) || [];

    for (const depId of dependents) {
      if (!visited.has(depId)) {
        visited.add(depId);
        const svc = serviceMap.get(depId);
        if (svc) {
          if (depth === 0) {
            // 1 hop away
            directlyAffected.push(svc);
          } else {
            // 2+ hops away
            potentiallyAffected.push(svc);
          }
        }
        queue.push({ id: depId, depth: depth + 1 });
      }
    }
  }

  return { directlyAffected, potentiallyAffected };
}

/**
 * 3. Deployment Correlation (Requirement 3 & Smart Requirement)
 * Finds deployments for the incident's service within windowMinutes BEFORE incident creation.
 */
export function findCorrelatedDeployments(deployments, incident, windowMinutes = 60) {
  const incTime = new Date(incident.created_at).getTime();
  const windowMs = windowMinutes * 60 * 1000;

  return deployments
    .filter((dep) => {
      if (Number(dep.service_id) !== Number(incident.service_id)) return false;
      const depTime = new Date(dep.deployed_at).getTime();
      const diff = incTime - depTime;
      // Deployed within [0, windowMinutes] prior to incident (or up to 15 mins after alert)
      return diff >= -15 * 60 * 1000 && diff <= windowMs;
    })
    .map((dep) => {
      const minutesPrior = Math.round(
        (incTime - new Date(dep.deployed_at).getTime()) / 60000
      );
      return {
        ...dep,
        isSuggestion: true,
        correlationLabel: 'Suggested Correlation (Unverified Root Cause)',
        minutesBeforeIncident: minutesPrior,
        explanation: `Deployment ${dep.version} occurred ${
          minutesPrior >= 0 ? `${minutesPrior}m before` : `${Math.abs(minutesPrior)}m after`
        } incident detection on the affected service.`,
      };
    });
}

/**
 * 4. Incident Recurrence Detection (Smart Requirement)
 * Flags previous incidents sharing the same service_id and category within 72 hours.
 */
export function findRecurringIncidents(allIncidents, targetIncident, windowHours = 72) {
  const targetTime = new Date(targetIncident.created_at).getTime();
  const windowMs = windowHours * 60 * 60 * 1000;

  return allIncidents.filter((inc) => {
    if (inc.id === targetIncident.id) return false;
    const sameService = Number(inc.service_id) === Number(targetIncident.service_id);
    const sameCategory =
      (inc.category || '').toLowerCase() === (targetIncident.category || '').toLowerCase();
    const timeDiff = Math.abs(targetTime - new Date(inc.created_at).getTime());
    return sameService && sameCategory && timeDiff <= windowMs;
  });
}