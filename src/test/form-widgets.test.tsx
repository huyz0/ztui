import { useState } from "react";
import { describe, expect, test } from "vitest";
import {
  App,
  Checkbox,
  EmailInput,
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

  test("Mouse interactions for form widgets (Checkbox, RadioGroup, Slider, Select)", async () => {
    let currentRadio = "A";
    let currentSlider = 50;
    let currentSelect = "Apple";
    let currentChecked = false;

    function TestWrapper() {
      const [checkedVal, setCheckedVal] = useState(false);
      const [radioVal, setRadioVal] = useState("A");
      const [sliderVal, setSliderVal] = useState(50);
      const [selectVal, setSelectVal] = useState("Apple");

      currentChecked = checkedVal;
      currentRadio = radioVal;
      currentSlider = sliderVal;
      currentSelect = selectVal;

      return (
        <VBox>
          <Checkbox id="chk" checked={checkedVal} label="Accept" onChange={setCheckedVal} />
          <RadioGroup
            id="radio-v"
            options={["A", "B"]}
            value={radioVal}
            orientation="vertical"
            onChange={setRadioVal}
          />
          <RadioGroup
            id="radio-h"
            options={["A", "B"]}
            value={radioVal}
            orientation="horizontal"
            onChange={setRadioVal}
          />
          <Slider id="sld" value={sliderVal} min={0} max={100} step={10} onChange={setSliderVal} />
          <Select
            id="sel"
            value={selectVal}
            options={["Apple", "Banana", "Cherry"]}
            onChange={setSelectVal}
          />
        </VBox>
      );
    }

    const driver = new VTEDriver(40, 15);
    const app = new App(driver);

    render(<TestWrapper />, app.activeScreen);

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // 1. Checkbox mouse click
    const chk = findWidgetById(app.activeScreen, "chk");
    chk.handleMouse({ type: "press", button: "left" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentChecked).toBe(true);

    // 2. RadioGroup vertical mouse click
    const radioV = findWidgetById(app.activeScreen, "radio-v");
    const rectV = radioV.getContentRect();
    // Click on B (index 1, offset y = 1)
    radioV.handleMouse({ type: "press", button: "left", x: rectV.x, y: rectV.y + 1 });
    // Wait for React state update to propagate
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentRadio).toBe("B");

    // 3. RadioGroup horizontal mouse click
    const radioH = findWidgetById(app.activeScreen, "radio-h");
    const rectH = radioH.getContentRect();
    // Option A starts at rectH.x, length is roughly 2 + 1 + 3 = 6
    radioH.handleMouse({ type: "press", button: "left", x: rectH.x + 1, y: rectH.y });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentRadio).toBe("A");

    // 4. Slider mouse drag/press
    const sld = findWidgetById(app.activeScreen, "sld");
    const rectS = sld.getContentRect();
    // Click at the start of track to set value to 0
    sld.handleMouse({ type: "press", button: "left", x: rectS.x, y: rectS.y });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentSlider).toBe(0);

    // 5. Select dropdown option click on overlay
    const sel = findWidgetById(app.activeScreen, "sel");
    // Click select header to open
    sel.handleMouse({ type: "press", button: "left" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sel.isOpen).toBe(true);
    expect(app.activeScreen.overlays.length).toBe(1);

    const overlay = app.activeScreen.overlays[0] as any;
    console.log("DEBUG Select dropdown bounds:", {
      dropdownX: overlay.dropdownX,
      dropdownY: overlay.dropdownY,
      dropdownWidth: overlay.dropdownWidth,
      dropdownHeight: overlay.dropdownHeight,
    });
    // Click on Banana (index 1)
    overlay.handleMouse({
      type: "press",
      button: "left",
      x: overlay.dropdownX + 2,
      y: overlay.dropdownY + 2, // dropdownY + 1 (border) + 1 (Banana index)
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    console.log("DEBUG Select after click:", { currentSelect, isOpen: sel.isOpen });
    expect(currentSelect).toBe("Banana");
    expect(sel.isOpen).toBe(false);

    app.stop();
  });

  test("Additional form widget edge cases for full coverage", async () => {
    let emailVal = "";
    let chkVal = false;
    let swVal = false;
    let radioVal = "A";
    let sliderVal = 50;
    let selectVal = "ExtremelyLongBananaOptionName";
    let toggleActive = false;
    let clickSpied = false;

    function ExtraTestWrapper() {
      const [email, setEmail] = useState("");
      const [chk, setChk] = useState(false);
      const [sw, setSw] = useState(false);
      const [radio, setRadio] = useState("A");
      const [slider, setSlider] = useState(50);
      const [sel, setSel] = useState("ExtremelyLongBananaOptionName");
      const [toggle, setToggle] = useState(false);

      emailVal = email;
      chkVal = chk;
      swVal = sw;
      radioVal = radio;
      sliderVal = slider;
      selectVal = sel;
      toggleActive = toggle;

      return (
        <VBox>
          <EmailInput id="email" value={email} onChange={setEmail} />
          <Checkbox
            id="chk-custom"
            checked={chk}
            style={{ width: 20, height: 2 }}
            onChange={setChk}
          />
          <Switch id="sw-custom" active={sw} style={{ width: 20, height: 2 }} onChange={setSw} />
          <RadioGroup
            id="radio-h-nav"
            options={["A", "B", "C"]}
            value={radio}
            orientation="horizontal"
            onChange={setRadio}
          />
          <RadioGroup
            id="radio-v-nav"
            options={["A", "B"]}
            value={radio}
            orientation="vertical"
            onChange={setRadio}
          />
          <Slider
            id="slider-nav"
            value={slider}
            min={0}
            max={100}
            step={10}
            style={{ width: 30 }}
            onChange={setSlider}
          />
          <Select
            id="sel-narrow"
            value={sel}
            options={["ExtremelyLongBananaOptionName", "B"]}
            style={{ width: 5 }}
            onChange={setSel}
          />
          <ToggleButton
            id="tgl-children"
            active={toggle}
            onChange={setToggle}
            onClick={() => {
              clickSpied = true;
            }}
          >
            ToggleMe
          </ToggleButton>
        </VBox>
      );
    }

    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<ExtraTestWrapper />, app.activeScreen);
    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Focus and click test for EmailInput
    const emailWidget = findWidgetById(app.activeScreen, "email");
    expect(emailWidget).toBeDefined();

    // Checkbox and Switch custom size measurement validation
    const chkCustom = findWidgetById(app.activeScreen, "chk-custom");
    const swCustom = findWidgetById(app.activeScreen, "sw-custom");
    expect(chkCustom.measuredWidth).toBe(20);
    expect(chkCustom.measuredHeight).toBe(2);
    expect(swCustom.measuredWidth).toBe(20);
    expect(swCustom.measuredHeight).toBe(2);

    // Checkbox and Switch Enter key toggle
    app.activeScreen.focusWidget(chkCustom);
    chkCustom.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chkVal).toBe(true);

    app.activeScreen.focusWidget(swCustom);
    swCustom.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(swVal).toBe(true);

    // RadioGroup horizontal navigation keys
    const radioHNav = findWidgetById(app.activeScreen, "radio-h-nav");
    app.activeScreen.focusWidget(radioHNav);
    radioHNav.handleKey({ key: "right" });
    radioHNav.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(radioVal).toBe("B");

    radioHNav.handleKey({ key: "left" });
    radioHNav.handleKey({ key: "space" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(radioVal).toBe("A");

    // RadioGroup vertical navigation keys
    const radioVNav = findWidgetById(app.activeScreen, "radio-v-nav");
    app.activeScreen.focusWidget(radioVNav);
    radioVNav.handleKey({ key: "down" });
    radioVNav.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(radioVal).toBe("B");

    radioVNav.handleKey({ key: "up" });
    radioVNav.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(radioVal).toBe("A");

    // Click on RadioGroup horizontal spacing (empty clicks) to test boundary branches
    const rectRadioH = radioHNav.getContentRect();
    radioHNav.handleMouse({
      type: "press",
      button: "left",
      x: rectRadioH.right + 10,
      y: rectRadioH.y,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Click on RadioGroup vertical out of bounds
    const radioVNavRect = radioVNav.getContentRect();
    radioVNav.handleMouse({
      type: "press",
      button: "left",
      x: radioVNavRect.x,
      y: radioVNavRect.bottom + 5,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Slider focus and keyboard navigation (up/down/left/right)
    const sliderNav = findWidgetById(app.activeScreen, "slider-nav");
    app.activeScreen.focusWidget(sliderNav);
    sliderNav.handleKey({ key: "right" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(60);

    sliderNav.handleKey({ key: "left" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(50);

    sliderNav.handleKey({ key: "up" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(60);

    sliderNav.handleKey({ key: "down" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(50);

    sliderNav.handleKey({ key: "escape" }); // unhandled key branch
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Slider drag mouse press out of bounds
    const rectS = sliderNav.getContentRect();
    sliderNav.handleMouse({ type: "press", button: "left", x: rectS.right + 10, y: rectS.y });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(100);

    sliderNav.handleMouse({ type: "press", button: "left", x: rectS.x - 5, y: rectS.y });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sliderVal).toBe(0);

    // Narrow Select widget character truncation and rendering test
    const selNarrow = findWidgetById(app.activeScreen, "sel-narrow");
    app.queueRender();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Open narrow select
    selNarrow.handleMouse({ type: "press", button: "left" });
    expect(selNarrow.isOpen).toBe(true);
    // Wait for dropdown overlay rendering to execute
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Close it by clicking outside the dropdown overlay
    expect(app.activeScreen.overlays.length).toBe(1);
    const activeOverlay = app.activeScreen.overlays[0];
    activeOverlay.handleMouse({
      type: "press",
      button: "left",
      x: 0,
      y: 0,
    });
    expect(selNarrow.isOpen).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // ToggleButton children TextNode and onClick spy
    const tglChildren = findWidgetById(app.activeScreen, "tgl-children");
    expect(tglChildren.getTextContent()).toBe("ToggleMe");

    app.activeScreen.focusWidget(tglChildren);
    tglChildren.handleKey({ key: "enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toggleActive).toBe(true);
    expect(clickSpied).toBe(true);

    tglChildren.handleMouse({ type: "press", button: "left" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toggleActive).toBe(false);

    expect(emailVal).toBe("");
    expect(selNarrow.value).toBe("ExtremelyLongBananaOptionName");
    expect(selectVal).toBe("ExtremelyLongBananaOptionName");

    app.stop();
  });
});
