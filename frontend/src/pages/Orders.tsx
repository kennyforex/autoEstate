import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/layout";
import { Button, Input, Select, Badge } from "../components/common";
import { ordersApi } from "../lib/api";
import type { Order } from "../lib/types";
import { format } from "date-fns";

const PAGE_SIZE = 25;

function formatMoney(currency: string, value: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${currency} ${n.toFixed(2)}`;
}

export const Orders: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    createdFrom: "",
    createdTo: "",
    deliveryFrom: "",
    deliveryTo: "",
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
    switch (order.paymentStatus) {
      case "paid":
        return <Badge variant="success">{t("ordersPage.payment.paid")}</Badge>;
      default:
        return <Badge variant="default">{t("ordersPage.payment.unpaid")}</Badge>;
    }
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const offset = page * PAGE_SIZE;
      const result = await ordersApi.list({
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        createdFrom: filters.createdFrom || undefined,
        createdTo: filters.createdTo || undefined,
        deliveryFrom: filters.deliveryFrom || undefined,
        deliveryTo: filters.deliveryTo || undefined,
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
  }, [filters.search, filters.status, filters.createdFrom, filters.createdTo, filters.deliveryFrom, filters.deliveryTo]);

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
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                {t("ordersPage.filters")}
              </span>
            </div>

            <div className="w-64">
              <Input
                type="search"
                placeholder={t("ordersPage.searchPlaceholder")}
                value={filters.search}
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="w-44">
              <Select
                value={filters.status}
                onChange={(value) => setFilters((p) => ({ ...p, status: value }))}
                options={[
                  { value: "", label: t("ordersPage.allStatuses") },
                  { value: "open", label: t("ordersPage.status.open") },
                  { value: "completed", label: t("ordersPage.status.completed") },
                  { value: "cancelled", label: t("ordersPage.status.cancelled") },
                ]}
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="w-44">
                <Input
                  type="date"
                  label={t("ordersPage.createdFrom")}
                  value={filters.createdFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, createdFrom: e.target.value }))}
                />
              </div>
              <div className="w-44">
                <Input
                  type="date"
                  label={t("ordersPage.createdTo")}
                  value={filters.createdTo}
                  onChange={(e) => setFilters((p) => ({ ...p, createdTo: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-44">
                <Input
                  type="date"
                  label={t("ordersPage.deliveryFrom")}
                  value={filters.deliveryFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, deliveryFrom: e.target.value }))}
                />
              </div>
              <div className="w-44">
                <Input
                  type="date"
                  label={t("ordersPage.deliveryTo")}
                  value={filters.deliveryTo}
                  onChange={(e) => setFilters((p) => ({ ...p, deliveryTo: e.target.value }))}
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
                        <td className="p-3 font-medium text-gray-900">
                          {order.orderNumber}
                        </td>
                        <td className="p-3 text-gray-600">
                          {order.createdAt ? format(new Date(order.createdAt), "PP p") : "—"}
                        </td>
                        <td className="p-3 text-gray-700">
                          {order.clientName || order.phoneNumber || order.email || "—"}
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

