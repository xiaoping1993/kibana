/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import _ from 'lodash';
import { Metric } from '../classes';
import {
  LARGE_FLOAT,
  SMALL_FLOAT,
  SMALL_BYTES
} from '../../../../common/formatting';
import { NORMALIZED_DERIVATIVE_UNIT } from '../../../../common/constants';

export class ElasticsearchMetric extends Metric {
  constructor(opts) {
    super({
      ...opts,
      app: 'elasticsearch',
      uuidField: 'source_node.uuid',
      timestampField: 'timestamp'
    });

    this.checkRequiredParams({ type: opts.type });
  }

  static getMetricFields() {
    return {
      uuidField: 'source_node.uuid', // ???
      timestampField: 'timestamp'
    };
  }
}

export class LatencyMetric extends ElasticsearchMetric {
  constructor({ metric, fieldSource, ...opts }) {
    super({
      ...opts,
      format: LARGE_FLOAT,
      metricAgg: 'sum', // NOTE: this is used for a pointless aggregation
      units: 'ms'
    });

    this.checkRequiredParams({
      metric,
      fieldSource
    });

    let metricField;
    if (metric === 'index') {
      metricField = 'indexing.index';
    } else if (metric === 'query') {
      metricField = 'search.query';
    } else {
      throw new Error(
        'Latency metric param must be a string equal to `index` or `query`'
      );
    }

    const timeInMillisField = `${fieldSource}.${metricField}_time_in_millis`;
    const eventTotalField = `${fieldSource}.${metricField}_total`;

    this.aggs = {
      event_time_in_millis: {
        max: { field: timeInMillisField }
      },
      event_total: {
        max: { field: eventTotalField }
      },
      event_time_in_millis_deriv: {
        derivative: {
          buckets_path: 'event_time_in_millis',
          gap_policy: 'skip',
          unit: NORMALIZED_DERIVATIVE_UNIT
        }
      },
      event_total_deriv: {
        derivative: {
          buckets_path: 'event_total',
          gap_policy: 'skip',
          unit: NORMALIZED_DERIVATIVE_UNIT
        }
      }
    };

    this.calculation = (bucket, _key, _metric, _bucketSizeInSeconds) => {
      const timeInMillisDeriv = _.get(
        bucket,
        'event_time_in_millis_deriv.normalized_value',
        null
      );
      const totalEventsDeriv = _.get(
        bucket,
        'event_total_deriv.normalized_value',
        null
      );

      return Metric.calculateLatency(timeInMillisDeriv, totalEventsDeriv);
    };
  }
}

export class RequestRateMetric extends ElasticsearchMetric {
  constructor(opts) {
    super({
      ...opts,
      derivative: true,
      format: LARGE_FLOAT,
      metricAgg: 'max',
      units: '/s'
    });
  }
}

export class ThreadPoolQueueMetric extends ElasticsearchMetric {
  constructor(opts) {
    super({
      ...opts,
      title: 'Thread Queue',
      type: 'node',
      format: SMALL_FLOAT,
      metricAgg: 'max',
      units: ''
    });
  }
}

export class ThreadPoolRejectedMetric extends ElasticsearchMetric {
  constructor(opts) {
    super({
      ...opts,
      title: 'Thread Rejections',
      type: 'node',
      derivative: true,
      format: SMALL_FLOAT,
      metricAgg: 'max',
      units: ''
    });
  }
}

/**
 * A generic {@code class} for collecting Index Memory metrics.
 *
 * @see IndicesMemoryMetric
 * @see NodeIndexMemoryMetric
 * @see SingleIndexMemoryMetric
 */
export class IndexMemoryMetric extends ElasticsearchMetric {
  constructor(opts) {
    super({
      title: 'Index Memory',
      ...opts,
      format: SMALL_BYTES,
      metricAgg: 'max',
      units: 'B'
    });
  }
}

export class NodeIndexMemoryMetric extends IndexMemoryMetric {
  constructor(opts) {
    super({
      ...opts,
      type: 'node'
    });

    // override the field set by the super constructor
    this.field = 'node_stats.indices.segments.' + opts.field;
  }
}

export class IndicesMemoryMetric extends IndexMemoryMetric {
  constructor(opts) {
    super({
      ...opts,
      type: 'cluster'
    });

    // override the field set by the super constructor
    this.field = 'index_stats.total.segments.' + opts.field;
  }
}

export class SingleIndexMemoryMetric extends IndexMemoryMetric {
  constructor(opts) {
    super({
      ...opts,
      type: 'index'
    });

    // override the field set by the super constructor
    this.field = 'index_stats.total.segments.' + opts.field;
  }
}
