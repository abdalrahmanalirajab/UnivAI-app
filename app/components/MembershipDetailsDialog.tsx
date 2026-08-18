"use client";

import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TablePagination from "@mui/material/TablePagination";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CloseRounded from "@mui/icons-material/CloseRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SubscriptionSnapshot } from "@/lib/subscriptions";
import { formatDateTime } from "@/lib/time";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const CREDIT_REASON_LABELS: Record<
  SubscriptionSnapshot["creditActivity"][number]["reason"],
  string
> = {
  signup: "Welcome grant",
  weekly_grant: "Seven-day grant",
  subscription_payment: "Membership payment",
  spend: "Learning action",
  adjustment: "Account adjustment",
};

const STATUS_LABELS: Record<SubscriptionSnapshot["status"], string> = {
  active: "Active",
  approval_pending: "Awaiting approval",
  suspended: "Suspended",
  cancelled: "Revoked",
  expired: "Expired",
};

type MembershipDetailsDialogProps = {
  open: boolean;
  subscription: SubscriptionSnapshot;
  onClose: () => void;
  onSubscriptionChange: (subscription: SubscriptionSnapshot) => void;
  onActivityPageChange: (page: number, pageSize: number) => Promise<void>;
};

export default function MembershipDetailsDialog({
  open,
  subscription,
  onClose,
  onSubscriptionChange,
  onActivityPageChange,
}: MembershipDetailsDialogProps) {
  const [tab, setTab] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const paidMembershipActive =
    subscription.planCode !== "free" && subscription.status === "active";
  const paidMembershipRevocable =
    subscription.planCode !== "free" &&
    (subscription.status === "active" || subscription.status === "suspended");
  const provider =
    subscription.provider === "paypal"
      ? "PayPal"
      : paidMembershipActive
        ? "Sandbox presentation"
        : "None";

  async function revokeMembership() {
    setRevoking(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/paypal/cancel", { method: "POST" });
      const body = (await response.json()) as {
        subscription?: SubscriptionSnapshot;
        error?: string;
      };
      if (!response.ok || !body.subscription) {
        throw new Error(body.error ?? "Could not revoke your membership.");
      }
      onSubscriptionChange(body.subscription);
      setConfirmOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke your membership.");
    } finally {
      setRevoking(false);
    }
  }

  const motionState = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -3 },
      };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        slotProps={{
          backdrop: { className: "membership-dialog-backdrop" },
          paper: { className: "membership-dialog-paper" },
        }}
      >
        <DialogTitle component="div" className="membership-dialog-title">
          <Stack direction="row" className="spread-row align-start">
            <Stack spacing={0.25}>
              <Typography variant="h6" component="h2">
                Membership
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Plan details and Credit activity
              </Typography>
            </Stack>
            <IconButton size="small" aria-label="Close membership details" onClick={onClose}>
              <CloseRounded />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers className="membership-dialog-content">
          <Stack>
            <Stack direction="row" className="membership-overview-header spread-row align-center">
              <Stack spacing={0.35}>
                <Typography variant="caption" color="text.secondary">
                  Current plan
                </Typography>
                <Stack direction="row" spacing={1} className="align-center">
                  <Typography variant="h5">{subscription.planName}</Typography>
                  <Chip
                    size="small"
                    label={STATUS_LABELS[subscription.status]}
                    color={subscription.status === "active" ? "success" : "default"}
                  />
                </Stack>
              </Stack>
              <Stack spacing={0.2} className="membership-overview-balance">
                <Typography variant="caption" color="text.secondary">
                  Available Credits
                </Typography>
                <Typography variant="h5">
                  {NUMBER_FORMATTER.format(subscription.credits.availableBalance)}
                </Typography>
              </Stack>
            </Stack>

            <Tabs
              value={tab}
              onChange={(_, value: number) => setTab(value)}
              aria-label="Membership details sections"
              className="membership-dialog-tabs"
            >
              <Tab label="Overview" />
              <Tab label="Credit activity" />
            </Tabs>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={tab}
                {...motionState}
                transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: "easeOut" }}
              >
                {tab === 0 ? (
                  <Stack className="membership-tab-panel">
                    <Typography variant="subtitle2">Plan details</Typography>
                    <Divider />
                    <Stack direction="row" className="membership-detail-row spread-row">
                      <Typography variant="body2">Subscribed</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {subscription.subscribedAt
                          ? formatDateTime(subscription.subscribedAt)
                          : "Not subscribed"}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" className="membership-detail-row spread-row">
                      <Typography variant="body2">
                        {paidMembershipActive ? "Current period ends" : "Expiration"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {subscription.currentPeriodEndsAt
                          ? formatDateTime(subscription.currentPeriodEndsAt)
                          : "Never"}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" className="membership-detail-row spread-row">
                      <Typography variant="body2">Provider</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {provider}
                      </Typography>
                    </Stack>
                    {subscription.cancelledAt ? (
                      <>
                        <Divider />
                        <Stack direction="row" className="membership-detail-row spread-row">
                          <Typography variant="body2">Revoked</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {formatDateTime(subscription.cancelledAt)}
                          </Typography>
                        </Stack>
                      </>
                    ) : null}

                    <Stack direction="row" className="membership-section-heading spread-row">
                      <Typography variant="subtitle2">Credits</Typography>
                      <Tooltip title="Credits never expire and never affect core learning access or grades.">
                        <IconButton size="small" aria-label="About UnivAI Credits">
                          <InfoOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <Divider />
                    <Stack direction="row" className="membership-detail-row spread-row">
                      <Typography variant="body2">Weekly allowance</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {NUMBER_FORMATTER.format(subscription.credits.weeklyGrantAmount)} Credits
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack direction="row" className="membership-detail-row spread-row">
                      <Typography variant="body2">Next grant</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(subscription.credits.nextGrantAt)}
                      </Typography>
                    </Stack>

                    {paidMembershipRevocable ? (
                      <Button
                        color="error"
                        className="membership-revoke-button"
                        onClick={() => setConfirmOpen(true)}
                      >
                        Revoke membership
                      </Button>
                    ) : null}
                  </Stack>
                ) : (
                  <Stack className="membership-tab-panel">
                    <Stack spacing={0.25} className="membership-section-heading">
                      <Typography variant="subtitle2">Credit activity</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {subscription.creditActivityPagination.total} total entries
                      </Typography>
                    </Stack>
                    <Divider />
                    <List disablePadding className="credit-activity-list" aria-busy={activityLoading}>
                      {subscription.creditActivity.length ? (
                        subscription.creditActivity.map((transaction, index) => (
                          <ListItem
                            key={transaction.id}
                            disableGutters
                            className="credit-activity-row"
                            divider={index < subscription.creditActivity.length - 1}
                          >
                            <ListItemText
                              primary={CREDIT_REASON_LABELS[transaction.reason]}
                              secondary={formatDateTime(transaction.createdAt)}
                            />
                            <Stack className="credit-activity-amount">
                              <Typography
                                variant="body2"
                                color={transaction.amount >= 0 ? "success.main" : "error.main"}
                              >
                                {transaction.amount >= 0 ? "+" : ""}
                                {NUMBER_FORMATTER.format(transaction.amount)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Balance {NUMBER_FORMATTER.format(transaction.balanceAfter)}
                              </Typography>
                            </Stack>
                          </ListItem>
                        ))
                      ) : (
                        <ListItem disableGutters>
                          <ListItemText
                            primary="No Credit activity yet"
                            secondary="Your first wallet entry will appear here."
                          />
                        </ListItem>
                      )}
                    </List>
                    <TablePagination
                      component="div"
                      count={subscription.creditActivityPagination.total}
                      page={subscription.creditActivityPagination.page - 1}
                      rowsPerPage={subscription.creditActivityPagination.pageSize}
                      rowsPerPageOptions={[10, 25, 50]}
                      onPageChange={(_, nextPage) => {
                        setActivityLoading(true);
                        void onActivityPageChange(
                          nextPage + 1,
                          subscription.creditActivityPagination.pageSize,
                        ).finally(() => setActivityLoading(false));
                      }}
                      onRowsPerPageChange={(event) => {
                        const nextSize = Number(event.target.value);
                        setActivityLoading(true);
                        void onActivityPageChange(1, nextSize)
                          .finally(() => setActivityLoading(false));
                      }}
                    />
                  </Stack>
                )}
              </motion.div>
            </AnimatePresence>
          </Stack>
        </DialogContent>

        <DialogActions className="membership-dialog-actions">
          <Button component={Link} href="/subscribe" startIcon={<LaunchRounded />} onClick={onClose}>
            View plans
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={revoking ? undefined : () => setConfirmOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="revoke-membership-title"
        slotProps={{ paper: { className: "membership-confirm-paper" } }}
      >
        <DialogTitle id="revoke-membership-title">Revoke membership?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Paid benefits stop immediately. Your Credits and complete Free learning access remain.
            </Typography>
            <Alert severity="warning">
              <AlertTitle>No refunds</AlertTitle>
              Membership payments are final and non-refundable.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={revoking} onClick={() => setConfirmOpen(false)}>
            Keep membership
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={revoking}
            onClick={() => void revokeMembership()}
          >
            {revoking ? "Revoking..." : "Revoke now"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
