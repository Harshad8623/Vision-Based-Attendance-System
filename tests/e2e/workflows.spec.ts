import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A little clarity. A better day." }),
  ).toBeVisible();
}
test("teacher navigation and mobile layout have no runtime errors or overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "Teacher");
  for (const name of [
    "Attendance log",
    "Students",
    "Insights & streaks",
    "Leave requests",
    "Settings & people",
    "Take attendance",
  ]) {
    await page.getByRole("button", { name, exact: true }).first().click();
    await expect(page.locator(".content h1")).toBeVisible();
  }
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("student applies for leave and assigned class teacher approves it", async ({
  browser,
}) => {
  const student = await browser.newPage();
  await login(student, "Student");
  await student
    .getByRole("button", { name: "Leave requests", exact: true })
    .click();
  await student
    .getByRole("button", { name: "Apply for leave", exact: true })
    .click();
  await student.locator('input[name="start_date"]').fill("2027-06-18");
  await student.locator('input[name="end_date"]').fill("2027-06-18");
  await student
    .locator('textarea[name="reason"]')
    .fill("Attending the university project exhibition browser test.");
  await student
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(student.getByRole("status")).toContainText("Leave request sent");
  const teacher = await browser.newPage();
  await login(teacher, "Teacher");
  await teacher
    .getByRole("button", { name: "Leave requests", exact: true })
    .click();
  const card = teacher
    .locator(".leave-card")
    .filter({ hasText: "university project exhibition browser test" });
  await card.getByRole("button", { name: "Review request" }).click();
  await teacher
    .getByRole("dialog")
    .locator("textarea")
    .fill("Approved for your project exhibition.");
  await teacher.getByRole("button", { name: "Save decision" }).click();
  await expect(card.locator(".pill")).toContainText("approved");
  await student.reload();
  await student
    .getByRole("button", { name: "Leave requests", exact: true })
    .click();
  await expect(
    student
      .locator(".leave-card")
      .filter({ hasText: "university project exhibition browser test" }),
  ).toContainText("Approved for your project exhibition.");
  await teacher.close();
  await student.close();
});
test("teacher manually corrects attendance and finalizes a recoverable session", async ({
  page,
}) => {
  await login(page, "Teacher");
  await page
    .getByRole("button", { name: "Take attendance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  const row = page.getByRole("row").filter({ hasText: "Aarav Sharma" });
  await row.getByRole("button", { name: "Edit attendance" }).click();
  await page
    .getByRole("dialog")
    .locator("textarea")
    .fill("Student is present; verified manually in classroom.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(row.locator(".pill")).toContainText("present");
  await page.reload();
  await page
    .getByRole("button", { name: "Take attendance", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Aarav Sharma" }).locator(".pill"),
  ).toContainText("present");
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByText("Completed session", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Locked", exact: true }),
  ).toBeDisabled();
});
test("admin can create a teacher and manage class teacher access", async ({
  page,
}) => {
  await login(page, "Admin");
  await page
    .getByRole("button", { name: "Settings & people", exact: true })
    .click();
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await page.locator('input[name="name"]').fill("Prof. Test Educator");
  await page.locator('input[name="email"]').fill("educator@example.test");
  await page.locator('input[name="password"]').fill("SecureClass@2027");
  await page
    .getByRole("button", { name: "Create teacher", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Teacher account created",
  );
  const assignment = page.locator('select[aria-label^="Class teacher for"]');
  await assignment.selectOption({ label: "Prof. Test Educator" });
  await expect(page.getByRole("status")).toContainText(
    "Teacher assignment updated",
  );
  await expect(assignment.locator("option:checked")).toHaveText(
    "Prof. Test Educator",
  );
});
