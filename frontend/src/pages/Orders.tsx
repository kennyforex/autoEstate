import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Input, Select, Badge } from "../components/common";
import { ordersApi } from "../lib/api";
import type { Order, OrderPaymentStatus } from "../lib/types";
import {
  formatHongKongPickupDate,
  formatHongKongPickupTime,
} from "../utils/hongKongDateTime";
import { format } from "date-fns";

const PAGE_SIZE = 25;

function formatMoney(currency: string, value: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${currency} ${n.toFixed(2)}`;
}

function getOrderItemTitle(order: Order["items"][number]) {
  return [order.snapshot.productName, order.snapshot.variantLabel || order.snapshot.optionSummary]
    .filter(Boolean)
    .join(" / ");
}

function paymentBadgeVariant(status: OrderPaymentStatus): "success" | "warning" | "default" {
  if (status === "paid") return "success";
  if (status === "verifying") return "warning";
  return "default";
}

export const Orders: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    dateType: "created" as "created" | "delivery",
    dateFrom: "",
    dateTo: "",
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusBadge = (order: Order) => {
    switch (order.fulfillmentStatus) {
      case "fulfilled":
        return <Badge variant="success">{t("ordersPage.fulfillment.fulfilled")}</Badge>;
      default:
        return <Badge variant="warning">{t("ordersPage.fulfillment.unfulfilled")}</Badge>;
    }
  };

  const paymentBadge = (order: Order) => {
    return (
      <Badge variant={paymentBadgeVariant(order.paymentStatus)}>
        {t(`ordersPage.payment.${order.paymentStatus}`)}
      </Badge>
    );
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const offset = page * PAGE_SIZE;
      const dateParams =
        filters.dateType === "delivery"
          ? {
              deliveryFrom: filters.dateFrom || undefined,
              deliveryTo: filters.dateTo || undefined,
            }
          : {
              createdFrom: filters.dateFrom || undefined,
              createdTo: filters.dateTo || undefined,
            };
      const result = await ordersApi.list({
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        ...dateParams,
        limit: PAGE_SIZE,
        offset,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setOrders(result.orders);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(0);
  }, [filters.search, filters.status, filters.dateType, filters.dateFrom, filters.dateTo]);

  const summary = useMemo(() => {
    if (total === 0) return t("ordersPage.summary.none");
    const start = page * PAGE_SIZE + 1;
    const end = Math.min((page + 1) * PAGE_SIZE, total);
    return t("ordersPage.summary.range", { start, end, total });
  }, [page, total, t]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title={t("ordersPage.title")}
          subtitle={t("ordersPage.subtitle")}
          actions={
            <Button onClick={() => navigate("/orders/new")}>
              {t("ordersPage.newOrder")}
            </Button>
          }
        />

        <div className="mt-6">
          <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:max-w-md">
                <Input
                  type="search"
                  placeholder={t("ordersPage.searchPlaceholder")}
                  value={filters.search}
                  onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                  leftIcon={<Search className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  label={t("ordersPage.filterStatus")}
                  value={filters.status}
                  onChange={(value) => setFilters((p) => ({ ...p, status: value }))}
                  options={[
                    { value: "", label: t("ordersPage.allStatuses") },
                    { value: "open", label: t("ordersPage.status.open") },
                    { value: "completed", label: t("ordersPage.status.completed") },
                    { value: "cancelled", label: t("ordersPage.status.cancelled") },
                  ]}
                />

                <Select
                  label={t("ordersPage.dateType")}
                  value={filters.dateType}
                  onChange={(value) =>
                    setFilters((p) => ({
                      ...p,
                      dateType: value as "created" | "delivery",
                    }))
                  }
                  options={[
                    { value: "created", label: t("ordersPage.dateTypeOrder") },
                    { value: "delivery", label: t("ordersPage.dateTypeShipping") },
                  ]}
                />

                <Input
                  type="date"
                  label={t("ordersPage.from")}
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                />

                <Input
                  type="date"
                  label={t("ordersPage.to")}
                  value={filters.dateTo}
                  onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-500 mb-3">{summary}</div>

          {loading && orders.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              {t("ordersPage.loading")}
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              {t("ordersPage.empty")}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                      <th className="p-3">{t("ordersPage.columns.order")}</th>
                      <th className="p-3">{t("ordersPage.columns.createdAt")}</th>
                      <th className="p-3">{t("ordersPage.columns.customer")}</th>
                      <th className="p-3">{t("ordersPage.columns.pickup")}</th>
                      <th className="p-3">{t("ordersPage.columns.payment")}</th>
                      <th className="p-3">{t("ordersPage.columns.fulfillment")}</th>
                      <th className="p-3 text-right">{t("ordersPage.columns.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order._id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/orders/${order._id}`)}
                      >
                        <td className="p-3 align-top text-gray-900">
                          <div className="space-y-2">
                            <div className="font-medium">{order.orderNumber}</div>
                            {order.items.length > 0 ? (
                              <div className="space-y-2">
                                {order.items.map((item, index) => (
                                  <div
                                    key={`${order._id}-${index}`}
                                    className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700"
                                  >
                                    <div className="font-medium text-gray-900">
                                      {getOrderItemTitle(item) || "—"}
                                    </div>
                                    <div className="mt-1">
                                      {t("ordersPage.item.qty")}: {item.quantity}
                                    </div>
                                    {item.notes ? (
                                      <div className="mt-1 text-gray-600">
                                        {t("ordersPage.item.notes")}: {item.notes}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-gray-600">
                          {order.createdAt ? format(new Date(order.createdAt), "PP p") : "—"}
                        </td>
                        <td className="p-3 text-gray-700">
                          {order.clientName || order.phoneNumber || order.email || "—"}
                        </td>
                        <td className="p-3 align-top text-gray-600">
                          <div className="space-y-0.5 text-xs">
                            <div>
                              {formatHongKongPickupDate(
                                order.deliveryDate,
                                i18n.language,
                              )}
                            </div>
                            <div>{formatHongKongPickupTime(order.deliveryDate)}</div>
                            <div className="text-gray-900">
                              {order.shippingMethod?.trim() || "—"}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">{paymentBadge(order)}</td>
                        <td className="p-3">{statusBadge(order)}</td>
                        <td className="p-3 text-right font-medium text-gray-900">
                          {formatMoney(order.currency, order.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t("ordersPage.prev")}
                </Button>
                <div className="text-sm text-gray-500">
                  {t("ordersPage.pageOf", { page: page + 1, totalPages })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  {t("ordersPage.next")}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

