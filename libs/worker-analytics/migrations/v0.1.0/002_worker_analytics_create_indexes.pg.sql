-- Common dashboard query patterns.

-- tenant-wide pattern timeline ("API errors across this tenant last hour")
CREATE INDEX IF NOT EXISTS ikary_analytics_buckets_hourly_tenant_pattern_idx
  ON ikary_analytics_buckets_hourly (tenant_id, bucket_start DESC, analytics_pattern);

-- workspace-scoped pattern timeline
CREATE INDEX IF NOT EXISTS ikary_analytics_buckets_hourly_tenant_workspace_pattern_idx
  ON ikary_analytics_buckets_hourly (tenant_id, workspace_id, bucket_start DESC, analytics_pattern);

-- business-domain rollups ("activity on invoice aggregate yesterday")
CREATE INDEX IF NOT EXISTS ikary_analytics_buckets_hourly_tenant_domain_idx
  ON ikary_analytics_buckets_hourly (tenant_id, bucket_start DESC, business_domain);
