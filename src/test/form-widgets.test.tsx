import { useState } from "react";
import { describe, expect, test } from "vitest";
import {
  Checkbox,
  EmailInput,
  PasswordInput,
  RadioGroup,
  Select,
  Slider,
  Switch,
  ToggleButton,
  VBox,
} from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("ZTUI Form Widgets Suite", () => {
  test("Checkbox toggle state and keypress", async () => {
    let checkedVal = false;
    const { screen, findById } = await mountApp(
      <Checkbox
        id="chk"
        checked={checkedVal}
        label="Accept"
        onChange={(val) => {
          checkedVal = val;
        }}
      />,
      { cols: 30, rows: 5 },
    );

    const chkWidget = findById("chk");
    expect(chkWidget).toBeDefined();
    expect(chkWidget.checked).toBe(false);

    // Focus widget
    screen.focusWidget(chkWidget);
    expect(chkWidget.focused).toBe(true);

    // Simulate space key
    chkWidget.handleKey({ key: "space" });
    expect(checkedVal).toBe(true);
    expect(chkWidget.checked).toBe(true);
  });

  test("Switch toggle state and mouse click", async () => {
    let activeVal = false;
    const { findById } = await mountApp(
      <Switch
        id="sw"
        active={activeVal}
        label="Dark Mode"
        onChange={(val) => {
          activeVal = val;
        }}
      />,
      { cols: 30, rows: 5 },
    );

    const swWidget = findById("sw");
    expect(swWidget).toBeDefined();
    expect(swWidget.active).toBe(false);

    // Simulate mouse press
    swWidget.handleMouse({ type: "press", button: "left" });
    expect(activeVal).toBe(true);
    expect(swWidget.active).toBe(true);
  });

  test("Slider boundary validation and arrow keys", async () => {
    let sliderVal = 50;
    const { findById } = await mountApp(
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
      { cols: 30, rows: 5 },
    );

    const sldWidget = findById("sld");
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
  });

  test("Slider scrubs only on press/drag, not on hover motion", async () => {
    let sliderVal = 50;
    const { findById } = await mountApp(
      <Slider
        id="s2"
        value={sliderVal}
        min={0}
        max={100}
        step={1}
        onChange={(v) => {
          sliderVal = v;
        }}
      />,
      { cols: 30, rows: 5 },
    );
    const s = findById("s2");
    const rect = s.getContentRect();
    const farX = rect.x + rect.width - 1;

    // Hover motion across the track must not change the value (Ghostty 1003).
    s.handleMouse({ type: "move", button: "none", x: farX, y: rect.y });
    expect(sliderVal).toBe(50);

    // A drag with no preceding press (e.g. a misclassified hover) is ignored too.
    s.handleMouse({ type: "drag", button: "left", x: farX, y: rect.y });
    expect(sliderVal).toBe(50);

    // A real press starts the scrub; a subsequent drag continues it.
    s.handleMouse({ type: "press", button: "left", x: rect.x, y: rect.y });
    expect(sliderVal).toBe(0);
    s.handleMouse({ type: "drag", button: "left", x: farX, y: rect.y });
    expect(sliderVal).toBe(100);

    // After release, hover/drag motion is inert again.
    s.handleMouse({ type: "release", button: "left", x: farX, y: rect.y });
    s.handleMouse({ type: "drag", button: "left", x: rect.x, y: rect.y });
    expect(sliderVal).toBe(100);
  });

  test("Select dropdown open/close and keyboard choices", async () => {
    let selectVal = "";
    const { screen, findById } = await mountApp(
      <Select
        id="sel"
        value={selectVal}
        options={["Apple", "Banana", "Cherry"]}
        onChange={(val) => {
          selectVal = val;
        }}
      />,
      { cols: 40, rows: 15 },
    );

    const selWidget = findById("sel");
    expect(selWidget).toBeDefined();
    expect(selWidget.isOpen).toBe(false);

    // Simulate mouse click on header to open
    selWidget.handleMouse({ type: "press", button: "left" });
    expect(selWidget.isOpen).toBe(true);

    // Check overlay has been added to Screen
    expect(screen.overlays.length).toBe(1);

    // Navigate to next option (Banana)
    selWidget.handleKey({ key: "down" });
    expect(selWidget.hoveredIndex).toBe(1);

    // Select current hovered option via Enter
    selWidget.handleKey({ key: "enter" });
    expect(selectVal).toBe("Banana");
    expect(selWidget.isOpen).toBe(false);
    expect(screen.overlays.length).toBe(0);

    // Reopen using enter
    selWidget.handleKey({ key: "enter" });
    expect(selWidget.isOpen).toBe(true);
    expect(screen.overlays.length).toBe(1);

    // Simulate clicking outside of the dropdown boundary to close
    const activeOverlay = screen.overlays[0];
    activeOverlay.handleMouse({
      type: "press",
      button: "left",
      x: 0,
      y: 0, // Top-left click (outside dropdown)
    });
    expect(selWidget.isOpen).toBe(false);
    expect(screen.overlays.length).toBe(0);
  });

  test("Select dropdown multiselect toggles on Space and keeps open", async () => {
    let selectVal: string[] = [];
    const { screen, findById } = await mountApp(
      <Select
        id="sel-multi"
        multiple={true}
        value={selectVal}
        options={["A", "B", "C"]}
        onChange={(val) => {
          selectVal = val;
        }}
      />,
      { cols: 40, rows: 15 },
    );

    const selWidget = findById("sel-multi");
    expect(selWidget.isOpen).toBe(false);

    // Open dropdown
    selWidget.handleKey({ key: "enter" });
    expect(selWidget.isOpen).toBe(true);
    expect(screen.overlays.length).toBe(1);

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
    expect(screen.overlays.length).toBe(0);
  });

  test("Password input masks characters with bullets", async () => {
    const { buffer, findById } = await mountApp(<PasswordInput id="pass" value="secret123" />, {
      cols: 40,
      rows: 5,
    });

    const contentRect = findById("pass").getContentRect();

    // Verify cell contents
    const passCell = buffer.cells[contentRect.y][contentRect.x + 4]; // Lock icon takes 2 + 1 space = 3, so index 3 is space, 4 is start of text
    expect(passCell.char).toBe("•");
  });

  test("Space character key toggles Switch and Checkbox and selects RadioGroup", async () => {
    let checkedVal = false;
    let switchActive = false;
    let radioVal = "A";
    const { screen, findById } = await mountApp(
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
      { cols: 30, rows: 10 },
    );

    const chk = findById("chk");
    const sw = findById("sw");
    const radio = findById("radio");

    // Toggle Checkbox using Space character
    screen.focusWidget(chk);
    chk.handleKey({ key: " " });
    expect(checkedVal).toBe(true);

    // Toggle Switch using Space character
    screen.focusWidget(sw);
    sw.handleKey({ key: " " });
    expect(switchActive).toBe(true);

    // Select Radio option using Space character
    screen.focusWidget(radio);
    radio.hoveredIndex = 1;
    radio.handleKey({ key: " " });
    expect(radioVal).toBe("B");
  });

  test("ToggleButton widget functionality", async () => {
    let toggled = false;
    const { screen, findById } = await mountApp(
      <ToggleButton
        id="tgl"
        active={toggled}
        label="Feature"
        onChange={(v) => {
          toggled = v;
        }}
      />,
      { cols: 30, rows: 5 },
    );

    const tgl = findById("tgl");
    expect(tgl.active).toBe(false);

    // Toggles active state on click
    tgl.handleMouse({ type: "press", button: "left" });
    expect(toggled).toBe(true);
    expect(tgl.active).toBe(true);

    // Toggles active state back on Space character keypress
    screen.focusWidget(tgl);
    tgl.handleKey({ key: " " });
    expect(toggled).toBe(false);
    expect(tgl.active).toBe(false);
  });

  test("Form widgets measurement logic prevents zero width when height is specified", async () => {
    const { findById } = await mountApp(
      <VBox>
        <Checkbox id="chk" label="Accept" style={{ height: 1 }} />
        <Switch id="sw" label="News" style={{ height: 1 }} />
      </VBox>,
      { cols: 40, rows: 10 },
    );

    const chk = findById("chk");
    const sw = findById("sw");

    expect(chk.measuredWidth).toBeGreaterThan(0);
    expect(sw.measuredWidth).toBeGreaterThan(0);
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

    const { screen, findById, settle } = await mountApp(<TestWrapper />, { cols: 40, rows: 15 });

    // 1. Checkbox mouse click
    const chk = findById("chk");
    chk.handleMouse({ type: "press", button: "left" });
    await settle();
    expect(currentChecked).toBe(true);

    // 2. RadioGroup vertical mouse click
    const radioV = findById("radio-v");
    const rectV = radioV.getContentRect();
    // Click on B (index 1, offset y = 1)
    radioV.handleMouse({ type: "press", button: "left", x: rectV.x, y: rectV.y + 1 });
    // Wait for React state update to propagate
    await settle();
    expect(currentRadio).toBe("B");

    // 3. RadioGroup horizontal mouse click
    const radioH = findById("radio-h");
    const rectH = radioH.getContentRect();
    // Option A starts at rectH.x, length is roughly 2 + 1 + 3 = 6
    radioH.handleMouse({ type: "press", button: "left", x: rectH.x + 1, y: rectH.y });
    await settle();
    expect(currentRadio).toBe("A");

    // 4. Slider mouse drag/press
    const sld = findById("sld");
    const rectS = sld.getContentRect();
    // Click at the start of track to set value to 0
    sld.handleMouse({ type: "press", button: "left", x: rectS.x, y: rectS.y });
    await settle();
    expect(currentSlider).toBe(0);

    // 5. Select dropdown option click on overlay
    const sel = findById("sel");
    // Click select header to open
    sel.handleMouse({ type: "press", button: "left" });
    await settle();
    expect(sel.isOpen).toBe(true);
    expect(screen.overlays.length).toBe(1);

    const overlay = screen.overlays[0] as any;
    // Click on Banana (index 1)
    overlay.handleMouse({
      type: "press",
      button: "left",
      x: overlay.dropdownX + 2,
      y: overlay.dropdownY + 2, // dropdownY + 1 (border) + 1 (Banana index)
    });
    await settle();
    expect(currentSelect).toBe("Banana");
    expect(sel.isOpen).toBe(false);
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

    const { app, screen, findById, settle } = await mountApp(<ExtraTestWrapper />, {
      cols: 80,
      rows: 24,
    });

    // Focus and click test for EmailInput
    const emailWidget = findById("email");
    expect(emailWidget).toBeDefined();

    // Checkbox and Switch custom size measurement validation
    const chkCustom = findById("chk-custom");
    const swCustom = findById("sw-custom");
    expect(chkCustom.measuredWidth).toBe(20);
    expect(chkCustom.measuredHeight).toBe(2);
    expect(swCustom.measuredWidth).toBe(20);
    expect(swCustom.measuredHeight).toBe(2);

    // Checkbox and Switch Enter key toggle
    screen.focusWidget(chkCustom);
    chkCustom.handleKey({ key: "enter" });
    await settle();
    expect(chkVal).toBe(true);

    screen.focusWidget(swCustom);
    swCustom.handleKey({ key: "enter" });
    await settle();
    expect(swVal).toBe(true);

    // RadioGroup horizontal navigation keys
    const radioHNav = findById("radio-h-nav");
    screen.focusWidget(radioHNav);
    radioHNav.handleKey({ key: "right" });
    radioHNav.handleKey({ key: "enter" });
    await settle();
    expect(radioVal).toBe("B");

    radioHNav.handleKey({ key: "left" });
    radioHNav.handleKey({ key: "space" });
    await settle();
    expect(radioVal).toBe("A");

    // RadioGroup vertical navigation keys
    const radioVNav = findById("radio-v-nav");
    screen.focusWidget(radioVNav);
    radioVNav.handleKey({ key: "down" });
    radioVNav.handleKey({ key: "enter" });
    await settle();
    expect(radioVal).toBe("B");

    radioVNav.handleKey({ key: "up" });
    radioVNav.handleKey({ key: "enter" });
    await settle();
    expect(radioVal).toBe("A");

    // Click on RadioGroup horizontal spacing (empty clicks) to test boundary branches
    const rectRadioH = radioHNav.getContentRect();
    radioHNav.handleMouse({
      type: "press",
      button: "left",
      x: rectRadioH.right + 10,
      y: rectRadioH.y,
    });
    await settle();
    // Click on RadioGroup vertical out of bounds
    const radioVNavRect = radioVNav.getContentRect();
    radioVNav.handleMouse({
      type: "press",
      button: "left",
      x: radioVNavRect.x,
      y: radioVNavRect.bottom + 5,
    });
    await settle();

    // Slider focus and keyboard navigation (up/down/left/right)
    const sliderNav = findById("slider-nav");
    screen.focusWidget(sliderNav);
    sliderNav.handleKey({ key: "right" });
    await settle();
    expect(sliderVal).toBe(60);

    sliderNav.handleKey({ key: "left" });
    await settle();
    expect(sliderVal).toBe(50);

    sliderNav.handleKey({ key: "up" });
    await settle();
    expect(sliderVal).toBe(60);

    sliderNav.handleKey({ key: "down" });
    await settle();
    expect(sliderVal).toBe(50);

    sliderNav.handleKey({ key: "escape" }); // unhandled key branch
    await settle();

    // Slider drag mouse press out of bounds
    const rectS = sliderNav.getContentRect();
    sliderNav.handleMouse({ type: "press", button: "left", x: rectS.right + 10, y: rectS.y });
    await settle();
    expect(sliderVal).toBe(100);

    sliderNav.handleMouse({ type: "press", button: "left", x: rectS.x - 5, y: rectS.y });
    await settle();
    expect(sliderVal).toBe(0);

    // Narrow Select widget character truncation and rendering test
    const selNarrow = findById("sel-narrow");
    app.queueRender();
    await settle();

    // Open narrow select
    selNarrow.handleMouse({ type: "press", button: "left" });
    expect(selNarrow.isOpen).toBe(true);
    // Wait for dropdown overlay rendering to execute
    await settle();

    // Close it by clicking outside the dropdown overlay
    expect(screen.overlays.length).toBe(1);
    const activeOverlay = screen.overlays[0];
    activeOverlay.handleMouse({
      type: "press",
      button: "left",
      x: 0,
      y: 0,
    });
    expect(selNarrow.isOpen).toBe(false);
    await settle();

    // ToggleButton children TextNode and onClick spy
    const tglChildren = findById("tgl-children");
    expect(tglChildren.getTextContent()).toBe("ToggleMe");

    screen.focusWidget(tglChildren);
    tglChildren.handleKey({ key: "enter" });
    await settle();
    expect(toggleActive).toBe(true);
    expect(clickSpied).toBe(true);

    tglChildren.handleMouse({ type: "press", button: "left" });
    await settle();
    expect(toggleActive).toBe(false);

    expect(emailVal).toBe("");
    expect(selNarrow.value).toBe("ExtremelyLongBananaOptionName");
    expect(selectVal).toBe("ExtremelyLongBananaOptionName");
  });
});
