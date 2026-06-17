import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const resetPasswordForEmail = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PortalForgotPassword from "./PortalForgotPassword";
import { renderWithRouter } from "@/test/test-utils";

describe("PortalForgotPassword (regression)", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("calls Supabase Auth with a portal /reset-password redirect", async () => {
    renderWithRouter(<PortalForgotPassword />);
    await userEvent.type(screen.getByLabelText(/email/i), "regression+client.active@accountancyos.test");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));
    const [email, options] = resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("regression+client.active@accountancyos.test");
    expect(options.redirectTo).toMatch(/\/portal\/reset-password$/);
  });

  it("shows enumeration-safe success even when the auth call fails", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "User not found" } });
    renderWithRouter(<PortalForgotPassword />);
    await userEvent.type(screen.getByLabelText(/email/i), "missing@example.test");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() =>
      expect(screen.getByText(/if an account exists for/i)).toBeInTheDocument(),
    );
    expect(resetPasswordForEmail).toHaveBeenCalled();
  });

  it("never exposes the entered email back to the form before submission", async () => {
    renderWithRouter(<PortalForgotPassword />);
    expect(screen.queryByText(/if an account exists for/i)).not.toBeInTheDocument();
  });
});