"use client";

/**
 * Trang Tổng quan — số liệu nhanh + phân bố bài viết theo nhóm.
 *
 * Gọi GET /api/stats → { total, groups:[{groupId, groupName, count}] }.
 */

import { useApi } from "@/lib/use-api";
import { fmtNumber } from "@/lib/format";
import type { StatsResponse } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { PageHeader, ErrorState } from "@/components/page-parts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<StatsResponse>("/api/stats");

  const total = data?.total ?? 0;
  const groupCount = data?.groups.length ?? 0;
  const avg = groupCount > 0 ? Math.round(total / groupCount) : 0;

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description={
          user?.displayName
            ? `Chào ${user.displayName}, đây là bức tranh dữ liệu của bạn.`
            : "Bức tranh nhanh về dữ liệu thu thập được."
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Tổng bài viết" value={total} loading={loading} />
            <StatCard label="Số nhóm" value={groupCount} loading={loading} />
            <StatCard
              label="Bài/nhóm (TB)"
              value={avg}
              loading={loading}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Phân bố theo nhóm</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : groupCount === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Chưa có dữ liệu. Hãy thu thập bài viết từ tiện ích mở rộng.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhóm</TableHead>
                      <TableHead className="text-right">Số bài</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.groups
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((g) => (
                        <TableRow key={g.groupId}>
                          <TableCell className="font-medium">
                            {g.groupName}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {fmtNumber(g.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <p
            className="tabular text-3xl font-semibold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {fmtNumber(value)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
