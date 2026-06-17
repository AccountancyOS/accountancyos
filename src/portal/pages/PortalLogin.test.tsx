import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInWithPassword = vi.fn();
const navigate = vi.fn();
const toastError = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: (...args: unknown[]) => signInWithPassword(...args) } },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

import PortalLogin from "./PortalLogin";
import { renderWithRouter } from "@/test/test-utils";

describe("PortalLogin (regression)", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    navigate.mockReset();
    toastError.mockReset();
  });

  it("signs in and navigates to /portal/dashboard on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderWithRouter(<PortalLogin />);
    await userEvent.type(screen.getByLabelText(/email/i), "regression+client.active@accountancyos.test");
    await userEvent.type(screen.getByLabelText(/password/i), "PortalQA!2026");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/portal/dashboard", { replace: true }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "regression+client.active@accountancyos.test",
      password: "PortalQA!2026",
    });
  });

  it("surfaces auth errors via toast and does not navigate", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    renderWithRouter(<PortalLogin />);
    await userEvent.type(screen.getByLabelText(/email/i), "regression+client.active@accountancyos.test");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid login credentials"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("exposes the forgot password route", () => {
    renderWithRouter(<PortalLogin />);
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/portal/forgot-password",
    );
  });
});