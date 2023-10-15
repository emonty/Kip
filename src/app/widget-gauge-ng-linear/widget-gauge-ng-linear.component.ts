import { ViewChild, ElementRef, Component, OnInit, AfterContentInit, Input, OnDestroy } from '@angular/core';
import { Subscription, sampleTime} from 'rxjs';
import { ResizedEvent } from 'angular-resize-event';

import { IZone, IZoneState } from '../app-settings.interfaces';
import { AppSettingsService } from '../app-settings.service';
import { SignalKService } from '../signalk.service';
import { UnitsService } from '../units.service';
import { IWidget, IWidgetSvcConfig } from '../widget-manager.service';
import { LinearGauge, LinearGaugeOptions } from '../gauges-module/linear-gauge';


interface IDataHighlight extends Array<{
  from : number;
  to : number;
  color: string;
}> {};

@Component({
  selector: 'app-widget-gauge-ng-linear',
  templateUrl: './widget-gauge-ng-linear.component.html',
  styleUrls: ['./widget-gauge-ng-linear.component.scss']
})

export class WidgetGaugeNgLinearComponent implements OnInit, OnDestroy, AfterContentInit {
  @ViewChild('linearWrapperDiv', {static: true, read: ElementRef}) private wrapper: ElementRef;
  @ViewChild('linearGauge', {static: true, read: ElementRef}) protected linearGauge: ElementRef;

  @Input('widgetProperties') widgetProperties!: IWidget;

  @ViewChild('primary', {static: true, read: ElementRef}) private primaryElement: ElementRef;
  @ViewChild('accent', {static: true, read: ElementRef}) private accentElement: ElementRef;
  @ViewChild('warn', {static: true, read: ElementRef}) private warnElement: ElementRef;
  @ViewChild('primaryDark', {static: true, read: ElementRef}) private primaryDarkElement: ElementRef;
  @ViewChild('accentDark', {static: true, read: ElementRef}) private accentDarkElement: ElementRef;
  @ViewChild('warnDark', {static: true, read: ElementRef}) private warnDarkElement: ElementRef;
  @ViewChild('background', {static: true, read: ElementRef}) private backgroundElement: ElementRef;

  defaultConfig: IWidgetSvcConfig = {
    displayName: null,
    filterSelfPaths: true,
    paths: {
      "gaugePath": {
        description: "Numeric Data",
        path: null,
        source: null,
        pathType: "number",
        isPathConfigurable: true,
        convertUnitTo: "unitless"
      }
    },
    gaugeType: 'ngLinearVertical',  //ngLinearVertical or ngLinearHorizontal
    gaugeTicks: false,
    minValue: 0,
    maxValue: 100,
    numInt: 1,
    numDecimal: 0,
    barColor: 'accent',
  };

  // main gauge value variable
  public dataValue = 0;
  public dataValueTrimmed = 0;
  private valueSub$: Subscription = null;
  private sample: number = 500;

  // dynamics theme support
  themeNameSub: Subscription = null;

  // Gauge options
  public gaugeOptions = {} as LinearGaugeOptions;
  public isGaugeVertical: Boolean = true;

  // Zones support
  zones: Array<IZone> = [];
  zonesSub: Subscription;

  constructor(
    private SignalKService: SignalKService,
    private UnitsService: UnitsService,
    private AppSettingsService: AppSettingsService, // need for theme change subscription
  ) {}

  ngOnInit() {
    this.subscribePath();
    this.subscribeTheme();
    this.subscribeZones();
  }

  ngOnDestroy() {
    this.unsubscribePath();
    this.unsubscribeTheme();
    this.unsubscribeZones();
  }

  ngAfterContentInit(){
    this.updateGaugeConfig();
  }

  subscribePath() {
    this.unsubscribePath();
    if (typeof(this.widgetProperties.config.paths['gaugePath'].path) != 'string') { return } // nothing to sub to...

    this.valueSub$ = this.SignalKService.subscribePath(this.widgetProperties.uuid, this.widgetProperties.config.paths['gaugePath'].path, this.widgetProperties.config.paths['gaugePath'].source).pipe(sampleTime(this.sample)).subscribe(
      newValue => {
        // Only push new values formated to gauge settings to reduce gauge paint requests
        let oldValue = this.dataValue;
        let temp = this.formatDataValue(this.UnitsService.convertUnit(this.widgetProperties.config.paths['gaugePath'].convertUnitTo, newValue.value));
        if (oldValue != temp) {
          this.dataValue = temp;
        }

        // set colors for zone state
        switch (newValue.state) {
          case IZoneState.warning:
            this.gaugeOptions.colorValueText = getComputedStyle(this.warnDarkElement.nativeElement).color;
            break;
          case IZoneState.alarm:
            this.gaugeOptions.colorValueText = getComputedStyle(this.warnDarkElement.nativeElement).color;
            break;
          default:
            this.gaugeOptions.colorValueText = getComputedStyle(this.wrapper.nativeElement).color;

        }

      }
    );
  }

  unsubscribePath() {
    if (this.valueSub$ !== null) {
      this.valueSub$.unsubscribe();
      this.valueSub$ = null;
      this.SignalKService.unsubscribePath(this.widgetProperties.uuid, this.widgetProperties.config.paths['gaugePath'].path)
    }
  }

   // Subscribe to theme event
   subscribeTheme() {
    this.themeNameSub = this.AppSettingsService.getThemeNameAsO().subscribe(
      themeChange => {
       setTimeout(() => {   // delay so browser getComputedStyles has time to complet theme style change.
        this.updateGaugeConfig();
       }, 50);
    })
  }

  unsubscribeTheme(){
    if (this.themeNameSub !== null) {
      this.themeNameSub.unsubscribe();
      this.themeNameSub = null;
    }
  }

  // Subscribe to Zones
  subscribeZones() {
    this.zonesSub = this.AppSettingsService.getZonesAsO().subscribe(
      zones => {
        this.zones = zones;
        this.updateGaugeConfig();
      });
  }

  unsubscribeZones(){
    if (this.zonesSub !== null) {
      this.zonesSub.unsubscribe();
      this.zonesSub = null;
    }
  }

  private formatDataValue(value:number): number {
    // make sure we are within range of the gauge settings, else the needle can go outside the range
    if (value < this.widgetProperties.config.minValue || value == null) {
      value = this.widgetProperties.config.minValue;
    }
    if (value > this.widgetProperties.config.maxValue) {
      value = this.widgetProperties.config.maxValue;
    }
    return value;
  }

  updateGaugeConfig(){
    //// Hack to get Theme colors using hidden minxin, DIV and @ViewChild
    let themePaletteColor = "";
    let themePaletteDarkColor = "";

    this.gaugeOptions.colorTitle = this.gaugeOptions.colorUnits = this.gaugeOptions.colorValueText = window.getComputedStyle(this.wrapper.nativeElement).color;

    this.gaugeOptions.colorPlate = window.getComputedStyle(this.wrapper.nativeElement).backgroundColor;
    this.gaugeOptions.colorBar = getComputedStyle(this.backgroundElement.nativeElement).color;
    this.gaugeOptions.colorMajorTicks = this.gaugeOptions.colorTitle;
    this.gaugeOptions.colorMinorTicks = this.gaugeOptions.colorTitle;

    this.gaugeOptions.colorNeedleEnd = "";
    this.gaugeOptions.colorNeedleShadowUp = "";
    this.gaugeOptions.colorNeedleShadowDown = "black";

    switch (this.widgetProperties.config.barColor) {
      case "primary":
          themePaletteColor = getComputedStyle(this.primaryElement.nativeElement).color;
          themePaletteDarkColor = getComputedStyle(this.primaryDarkElement.nativeElement).color;
          this.gaugeOptions.colorBarProgress = themePaletteColor;
          this.gaugeOptions.colorBarProgressEnd = themePaletteDarkColor;
          this.gaugeOptions.colorNeedle = themePaletteDarkColor;
          this.gaugeOptions.needleWidth = 5;
        break;

      case "accent":
          themePaletteColor = getComputedStyle(this.accentElement.nativeElement).color;
          themePaletteDarkColor = getComputedStyle(this.accentDarkElement.nativeElement).color;
          this.gaugeOptions.colorBarProgress = themePaletteColor;
          this.gaugeOptions.colorBarProgressEnd = themePaletteDarkColor;
          this.gaugeOptions.colorNeedle = themePaletteDarkColor;
          this.gaugeOptions.needleWidth = 5;
          break;

      case "warn":
          themePaletteColor = getComputedStyle(this.warnElement.nativeElement).color;
          themePaletteDarkColor = getComputedStyle(this.warnDarkElement.nativeElement).color;
          this.gaugeOptions.colorBarProgress = themePaletteColor;
          this.gaugeOptions.colorBarProgressEnd = themePaletteDarkColor;
          this.gaugeOptions.colorNeedle = themePaletteDarkColor;
          this.gaugeOptions.needleWidth = 5;
        break;

      case "nobar":
          themePaletteColor = getComputedStyle(this.backgroundElement.nativeElement).color;
          themePaletteDarkColor = getComputedStyle(this.warnDarkElement.nativeElement).color;
          this.gaugeOptions.colorBar = themePaletteColor;
          this.gaugeOptions.colorBarProgress = themePaletteColor;
          this.gaugeOptions.colorBarProgressEnd = themePaletteColor;
          this.gaugeOptions.colorNeedle = themePaletteDarkColor;
          this.gaugeOptions.needleWidth = 20;


        default:
        break;
    }

    // highlights
    let myZones: IDataHighlight = [];
    this.zones.forEach(zone => {
      // get zones for our path
      if (zone.path == this.widgetProperties.config.paths['gaugePath'].path) {
        let lower = zone.lower || this.widgetProperties.config.minValue;
        let upper = zone.upper || this.widgetProperties.config.maxValue;
        let color: string;
        switch (zone.state) {
          case 1:
            color = getComputedStyle(this.warnElement.nativeElement).color;
            break;
          case IZoneState.alarm:
            color = getComputedStyle(this.warnDarkElement.nativeElement).color;
            break;
          default:
            color = getComputedStyle(this.primaryElement.nativeElement).color;
        }

        myZones.push({from: lower, to: upper, color: color});
      }
    });
    this.gaugeOptions.highlights = myZones;


    // Config storage values
    this.gaugeOptions.minValue = this.widgetProperties.config.minValue;
    this.gaugeOptions.maxValue = this.widgetProperties.config.maxValue;
    this.gaugeOptions.valueInt = this.widgetProperties.config.numInt;
    this.gaugeOptions.valueDec = this.widgetProperties.config.numDecimal;

    this.gaugeOptions.majorTicksInt = this.widgetProperties.config.numInt;
    this.gaugeOptions.majorTicksDec = this.widgetProperties.config.numDecimal;

    this.gaugeOptions.animationDuration = this.sample - 25; // prevent data/amnimation collisions

    if (this.widgetProperties.config.gaugeTicks) {
      this.gaugeOptions.colorMajorTicks = this.gaugeOptions.colorNumbers = this.gaugeOptions.colorMinorTicks = this.gaugeOptions.colorTitle;
    } else {
      this.gaugeOptions.colorMajorTicks = this.gaugeOptions.colorNumbers = this.gaugeOptions.colorMinorTicks = "";
    }

    this.gaugeOptions.valueBox = true;
    this.gaugeOptions.valueBoxWidth = 100;
    this.gaugeOptions.valueBoxBorderRadius = 0;

    this.gaugeOptions.needle = true;
    this.gaugeOptions.needleType = "line";
    this.gaugeOptions.needleShadow = false;
    this.gaugeOptions.needleSide = "both";

    // Vertical
    if (this.widgetProperties.config.gaugeType == 'ngLinearVertical'){
      this.isGaugeVertical = true;   // Changes div wrapper class to respect aspect ratio
      this.gaugeOptions.barLength = 75;
      this.gaugeOptions.fontUnitsSize = 40;
      this.gaugeOptions.fontTitleSize = 40;

      // Vertical With ticks
      if (this.widgetProperties.config.gaugeTicks == true) {
        this.gaugeOptions.barWidth = 30;

        this.gaugeOptions.needleStart = -45;
        this.gaugeOptions.needleEnd = 55;

        this.gaugeOptions.exactTicks = false;
        this.gaugeOptions.tickSide = "right";
        this.gaugeOptions.ticksWidth = 8;
        this.gaugeOptions.ticksPadding = 4;

        this.gaugeOptions.strokeTicks = false;
        this.gaugeOptions.majorTicks = [this.widgetProperties.config.minValue, this.widgetProperties.config.maxValue];

        this.gaugeOptions.numberSide = "right";
        this.gaugeOptions.numbersMargin = 0;
        this.gaugeOptions.fontNumbersSize = 25;

        this.gaugeOptions.minorTicks = 10;
        this.gaugeOptions.ticksWidthMinor = 4;

        this.gaugeOptions.highlightsWidth = 15;
      }
      else {
        // Vertical No ticks
        this.gaugeOptions.barWidth = 100;

        this.gaugeOptions.needleStart = 0;
        this.gaugeOptions.needleEnd = 100;

        this.gaugeOptions.ticksWidth = 0;
        this.gaugeOptions.strokeTicks = false;
        this.gaugeOptions.majorTicks = [];

        this.gaugeOptions.ticksPadding = 0;
        this.gaugeOptions.minorTicks = 0;
        this.gaugeOptions.ticksWidthMinor = 0;
        this.gaugeOptions.numbersMargin = 0;
        this.gaugeOptions.fontNumbersSize = 0;

        this.gaugeOptions.highlightsWidth = 15;
      }
    }
    else {
      // horizontal
      this.isGaugeVertical = false;  // Changes div wrapper class to respect aspect ratio
      this.gaugeOptions.barLength = 80;
      this.gaugeOptions.fontTitleSize = 45;
      this.gaugeOptions.fontUnitsSize = 35;

      // horizontal With ticks
      this.gaugeOptions.barWidth = 40;
        if (this.widgetProperties.config.gaugeTicks == true) {

          this.gaugeOptions.exactTicks = false;
          this.gaugeOptions.barWidth = 30;

          this.gaugeOptions.needleStart = -45;
          this.gaugeOptions.needleEnd = 56;

          this.gaugeOptions.tickSide = "right";
          this.gaugeOptions.ticksWidth = 8;
          this.gaugeOptions.ticksPadding = 5;

          this.gaugeOptions.strokeTicks = false;
          this.gaugeOptions.majorTicks = [this.widgetProperties.config.minValue, this.widgetProperties.config.maxValue];

          this.gaugeOptions.numberSide = "right";
          this.gaugeOptions.numbersMargin = -5;
          this.gaugeOptions.fontNumbersSize = 25;

          this.gaugeOptions.minorTicks = 10;
          this.gaugeOptions.ticksWidthMinor = 5;

          this.gaugeOptions.highlightsWidth = 15;
      }
      else {
        // horizontal No ticks
        this.gaugeOptions.barWidth = 60;

        this.gaugeOptions.needleStart = 0;
        this.gaugeOptions.needleEnd = 100;

        this.gaugeOptions.ticksWidth = 0;
        this.gaugeOptions.strokeTicks = false;
        this.gaugeOptions.majorTicks = [];

        this.gaugeOptions.ticksPadding = 0;
        this.gaugeOptions.minorTicks = 0;
        this.gaugeOptions.ticksWidthMinor = 0;
        this.gaugeOptions.numbersMargin = 0;
        this.gaugeOptions.fontNumbersSize = 0;

        this.gaugeOptions.highlightsWidth = 15;
      }
    }
  }

  onResized(event: ResizedEvent) {

    this.gaugeOptions.height = event.newRect.height;

    if (this.isGaugeVertical == true) {
      this.gaugeOptions.width = (event.newRect.height * 0.30);
    }
    else {
      this.gaugeOptions.width = event.newRect.width;
    }
  }

}
