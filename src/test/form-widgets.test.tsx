import { describe, expect, test } from "vitest";
import {
  App,
  Checkbox,
  PasswordInput,
  RadioGroup,
  render,
  Select,
  Slider,
  Switch,
  ToggleButton,
  VBox,
} from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

function findWidgetById(screen: any, id: string): any {
  let found: any;
  screen.walk((n: any) => {
    if (n.id === id) found = n;
  });
  return found;
}

describe("ZTUI Form Widgets Suite", () => {
  test("Checkbox toggle state and keypress", async () => {
    let checkedVal = false;
    const driver = new VTEDriver(30, 5);
    const app = new App(driver);

    render(
      <Checkbox
        id="chk"
        checked={checkedVal}
        label="Accept"
        onChange={(val) => {
          checkedVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const chkWidget = findWidgetById(app.activeScreen, "chk");
    expect(chkWidget).toBeDefined();
    expect(chkWidget.checked).toBe(false);

    // Focus widget
    app.activeScreen.focusWidget(chkWidget);
    expect(chkWidget.focused).toBe(true);

    // Simulate space key
    chkWidget.handleKey({ key: "space" });
    expect(checkedVal).toBe(true);
    expect(chkWidget.checked).toBe(true);

    app.stop();
  });

  test("Switch toggle state and mouse click", async () => {
    let activeVal = false;
    const driver = new VTEDriver(30, 5);
    const app = new App(driver);

    render(
      <Switch
        id="sw"
        active={activeVal}
        label="Dark Mode"
        onChange={(val) => {
          activeVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const swWidget = findWidgetById(app.activeScreen, "sw");
    expect(swWidget).toBeDefined();
    expect(swWidget.active).toBe(false);

    // Simulate mouse press
    swWidget.handleMouse({ type: "press", button: "left" });
    expect(activeVal).toBe(true);
    expect(swWidget.active).toBe(true);

    app.stop();
  });

  test("Slider boundary validation and arrow keys", async () => {
    let sliderVal = 50;
    const driver = new VTEDriver(30, 5);
    const app = new App(driver);

    render(
      <Slider
        id="sld"
        value={sliderVal}
        min={0}
        max={100}
        step={10}
        onChange={(val) => {
          sliderVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const sldWidget = findWidgetById(app.activeScreen, "sld");
    expect(sldWidget).toBeDefined();
    expect(sldWidget.value).toBe(50);

    // Simulate key right (increase)
    sldWidget.handleKey({ key: "right" });
    expect(sliderVal).toBe(60);

    // Simulate key left twice (decrease)
    sldWidget.handleKey({ key: "left" });
    sldWidget.handleKey({ key: "left" });
    expect(sliderVal).toBe(40);

    // Set to boundary and overflow check
    sldWidget.value = 100;
    sldWidget.handleKey({ key: "right" });
    expect(sldWidget.value).toBe(100);

    app.stop();
  });

  test("Select dropdown open/close and keyboard choices", async () => {
    let selectVal = "";
    const driver = new VTEDriver(40, 15);
    const app = new App(driver);

    render(
      <Select
        id="sel"
        value={selectVal}
        options={["Apple", "Banana", "Cherry"]}
        onChange={(val) => {
          selectVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const selWidget = findWidgetById(app.activeScreen, "sel");
    expect(selWidget).toBeDefined();
    expect(selWidget.isOpen).toBe(false);

    // Simulate mouse click on header to open
    selWidget.handleMouse({ type: "press", button: "left" });
    expect(selWidget.isOpen).toBe(true);

    // Check overlay has been added to Screen
    expect(app.activeScreen.overlays.length).toBe(1);

    // Navigate to next option (Banana)
    selWidget.handleKey({ key: "down" });
    expect(selWidget.hoveredIndex).toBe(1);

    // Select current hovered option via Enter
    selWidget.handleKey({ key: "enter" });
    expect(selectVal).toBe("Banana");
    expect(selWidget.isOpen).toBe(false);
    expect(app.activeScreen.overlays.length).toBe(0);

    // Reopen using enter
    selWidget.handleKey({ key: "enter" });
    expect(selWidget.isOpen).toBe(true);
    expect(app.activeScreen.overlays.length).toBe(1);

    // Simulate clicking outside of the dropdown boundary to close
    const activeOverlay = app.activeScreen.overlays[0];
    activeOverlay.handleMouse({
      type: "press",
      button: "left",
      x: 0,
      y: 0, // Top-left click (outside dropdown)
    });
    expect(selWidget.isOpen).toBe(false);
    expect(app.activeScreen.overlays.length).toBe(0);

    app.stop();
  });

  test("Select dropdown multiselect toggles on Space and keeps open", async () => {
    let selectVal: string[] = [];
    const driver = new VTEDriver(40, 15);
    const app = new App(driver);

    render(
      <Select
        id="sel-multi"
        multiple={true}
        value={selectVal}
        options={["A", "B", "C"]}
        onChange={(val) => {
          selectVal = val;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const selWidget = findWidgetById(app.activeScreen, "sel-multi");
    expect(selWidget.isOpen).toBe(false);

    // Open dropdown
    selWidget.handleKey({ key: "enter" });
    expect(selWidget.isOpen).toBe(true);
    expect(app.activeScreen.overlays.length).toBe(1);

    // Highlight A (hoveredIndex 0) and toggle using space
    selWidget.handleKey({ key: "space" });
    expect(selectVal).toEqual(["A"]);
    expect(selWidget.isOpen).toBe(true); // Must remain open

    // Navigate to B and toggle using enter (should not close)
    selWidget.handleKey({ key: "down" });
    selWidget.handleKey({ key: "enter" });
    expect(selectVal).toEqual(["A", "B"]);
    expect(selWidget.isOpen).toBe(true); // Must remain open

    // Toggle B off using space
    selWidget.handleKey({ key: "space" });
    expect(selectVal).toEqual(["A"]);
    expect(selWidget.isOpen).toBe(true); // Must remain open

    // Close using escape
    selWidget.handleKey({ key: "escape" });
    expect(selWidget.isOpen).toBe(false);
    expect(app.activeScreen.overlays.length).toBe(0);

    app.stop();
  });

  test("Password input masks characters with bullets", async () => {
    const driver = new VTEDriver(40, 5);
    const app = new App(driver);

    render(<PasswordInput id="pass" value="secret123" />, app.activeScreen);

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const buffer = (app as any).currentBuffer;
    const contentRect = findWidgetById(app.activeScreen, "pass").getContentRect();

    // Verify cell contents
    const passCell = buffer.cells[contentRect.y][contentRect.x + 4]; // Lock icon takes 2 + 1 space = 3, so index 3 is space, 4 is start of text
    expect(passCell.char).toBe("•");

    app.stop();
  });

  test("Space character key toggles Switch and Checkbox and selects RadioGroup", async () => {
    let checkedVal = false;
    let switchActive = false;
    let radioVal = "A";
    const driver = new VTEDriver(30, 10);
    const app = new App(driver);

    render(
      <VBox>
        <Checkbox
          id="chk"
          checked={checkedVal}
          label="Accept"
          onChange={(val) => {
            checkedVal = val;
          }}
        />
        <Switch
          id="sw"
          active={switchActive}
          label="Mode"
          onChange={(val) => {
            switchActive = val;
          }}
        />
        <RadioGroup
          id="radio"
          options={["A", "B"]}
          value={radioVal}
          onChange={(val: string) => {
            radioVal = val;
          }}
        />
      </VBox>,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const chk = findWidgetById(app.activeScreen, "chk");
    const sw = findWidgetById(app.activeScreen, "sw");
    const radio = findWidgetById(app.activeScreen, "radio");

    // Toggle Checkbox using Space character
    app.activeScreen.focusWidget(chk);
    chk.handleKey({ key: " " });
    expect(checkedVal).toBe(true);

    // Toggle Switch using Space character
    app.activeScreen.focusWidget(sw);
    sw.handleKey({ key: " " });
    expect(switchActive).toBe(true);

    // Select Radio option using Space character
    app.activeScreen.focusWidget(radio);
    radio.hoveredIndex = 1;
    radio.handleKey({ key: " " });
    expect(radioVal).toBe("B");

    app.stop();
  });

  test("ToggleButton widget functionality", async () => {
    let toggled = false;
    const driver = new VTEDriver(30, 5);
    const app = new App(driver);

    render(
      <ToggleButton
        id="tgl"
        active={toggled}
        label="Feature"
        onChange={(v) => {
          toggled = v;
        }}
      />,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const tgl = findWidgetById(app.activeScreen, "tgl");
    expect(tgl.active).toBe(false);

    // Toggles active state on click
    tgl.handleMouse({ type: "press", button: "left" });
    expect(toggled).toBe(true);
    expect(tgl.active).toBe(true);

    // Toggles active state back on Space character keypress
    app.activeScreen.focusWidget(tgl);
    tgl.handleKey({ key: " " });
    expect(toggled).toBe(false);
    expect(tgl.active).toBe(false);

    app.stop();
  });

  test("Form widgets measurement logic prevents zero width when height is specified", async () => {
    const driver = new VTEDriver(40, 10);
    const app = new App(driver);

    render(
      <VBox>
        <Checkbox id="chk" label="Accept" style={{ height: 1 }} />
        <Switch id="sw" label="News" style={{ height: 1 }} />
      </VBox>,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const chk = findWidgetById(app.activeScreen, "chk");
    const sw = findWidgetById(app.activeScreen, "sw");

    expect(chk.measuredWidth).toBeGreaterThan(0);
    expect(sw.measuredWidth).toBeGreaterThan(0);

    app.stop();
  });
});
