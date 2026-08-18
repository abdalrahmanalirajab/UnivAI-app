import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import UiLocalizationProvider from "@/app/UiLocalizationProvider";
import { translateUiText } from "@/lib/ui-translations";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Arabic UI localization boundary", () => {
  it("translates UI text and accessible names while preserving authored content", () => {
    render(
      <UiLocalizationProvider locale="ar">
        <div>
          <button aria-label="Upload">Upload</button>
          <section data-generated-content="true" lang="en" dir="ltr">
            <h2>Overview</h2>
            <p>Generated lecture answer</p>
          </section>
          <p data-no-ui-translate="true" dir="auto">User supplied text</p>
        </div>
      </UiLocalizationProvider>,
    );

    expect(screen.getByRole("button", { name: "رفع الكتب" }).textContent).toBe("رفع الكتب");
    const generated = screen.getByText("Overview").closest("section");
    expect(generated?.getAttribute("lang")).toBe("en");
    expect(generated?.getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("Generated lecture answer")).toBeTruthy();
    expect(screen.getByText("User supplied text")).toBeTruthy();
  });

  it("localizes UI inserted after hydration but leaves a generated subtree unchanged", async () => {
    render(
      <UiLocalizationProvider locale="ar">
        <div data-testid="host" />
      </UiLocalizationProvider>,
    );

    act(() => {
      const host = screen.getByTestId("host");
      const action = document.createElement("button");
      action.textContent = "Save";
      action.setAttribute("aria-label", "Save");
      host.append(action);

      const generated = document.createElement("div");
      generated.dataset.generatedContent = "true";
      generated.lang = "en";
      generated.dir = "ltr";
      generated.textContent = "Overview";
      host.append(generated);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "حفظ" }).textContent).toBe("حفظ");
    });
    expect(screen.getByText("Overview").getAttribute("lang")).toBe("en");
  });

  it("supports bounded dynamic shell phrases without translating payload values", () => {
    expect(translateUiText("Ask · 2 Credits", "ar")).toBe("اسأل · 2 من الرصيد");
    expect(translateUiText("Regenerate · 15 Credits", "ar")).toBe(
      "أعد الإنشاء · 15 من الرصيد",
    );
    expect(translateUiText("Page 2 of 8", "ar")).toBe("الصفحة 2 من 8");
    expect(translateUiText("Welcome back, Mariam.", "ar")).toBe(
      "مرحبًا بعودتك، Mariam.",
    );
    expect(translateUiText("Evidence — pp. 4–5", "ar")).toBe("الدليل — pp. 4–5");
    expect(translateUiText("Live lecture Q&A", "ar")).toBe(
      "أسئلة وأجوبة المحاضرة المباشرة",
    );
    expect(translateUiText("UnivAI", "ar")).toBe("UnivAI");
    expect(translateUiText("lecture.ready", "ar")).toBe("lecture.ready");
    expect(translateUiText("cert_…", "ar")).toBe("cert_…");
    expect(translateUiText("Unknown generated sentence", "ar")).toBe(
      "Unknown generated sentence",
    );
  });
});
