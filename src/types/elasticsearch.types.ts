export interface ESHit<T = any> {
  _index: string;
  _id: string;
  _score?: number;
  _source?: T;
}

export interface ESSearchResponse<T = any> {
  took?: number;
  timed_out?: boolean;
  _shards?: any;
  aggregations?: any;
  hits: {
    total: number | { value: number };
    max_score?: number;
    hits: ESHit<T>[];
  };
}
