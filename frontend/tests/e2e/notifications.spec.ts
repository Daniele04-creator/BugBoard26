import { test, expect } from "./fixtures/session";
import { apiRead, apiWrite, createIssue, csrf } from "./fixtures/api";
import type { IssueDetail, Notification, Page } from "../../src/api/types";
test("opening an assignment notification marks it read and preserves issue navigation", async ({
  admin,
  member,
  viewer,
}) => {
  const issue = await createIssue(admin.request);
  await apiWrite<IssueDetail>(
    admin.request,
    `/issues/${issue.id}/assignment`,
    "PUT",
    { assigneeId: member.user.id, expectedVersion: issue.version },
  );
  const page = await member.context.newPage();
  await page.goto("/notifications?unreadOnly=true");
  const row = page.locator("li").filter({
    has: page.getByRole("link", { name: issue.title, exact: true }),
  });
  await expect(row).toContainText("Non letta");
  await row.getByRole("link", { name: issue.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/issues/${issue.id}$`));
  await expect(
    page.getByRole("heading", { name: issue.title, exact: true, level: 1 }),
  ).toBeVisible();
  const inbox = await apiRead<Page<Notification>>(
    member.request,
    "/notifications",
  );
  const assigned = inbox.items.find(
    (notification) => notification.issue.id === issue.id,
  );
  expect(assigned?.readAt).not.toBeNull();
  const foreign = await viewer.request.put(
    `/api/v1/notifications/${assigned!.id}/read`,
    { headers: await csrf(viewer.request) },
  );
  expect(foreign.status()).toBe(404);
  const otherInbox = await apiRead<Page<Notification>>(
    viewer.request,
    "/notifications",
  );
  expect(
    otherInbox.items.some((notification) => notification.id === assigned!.id),
  ).toBe(false);
});
