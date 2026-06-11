import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, getImageUrl } from '../lib/supabase';
import { useCurrency } from '../App';
import { CURRENCIES } from '../constants';
import Footer from '../components/Footer';
import PortalHeader from '../components/PortalHeader';
import ClientUnitsSection from '../components/ClientUnitsSection';
import ClientPaymentsSection from '../components/ClientPaymentsSection';

// Keys for the client onboarding guide. Titles/texts live in i18n
// (admin.clientDash.guideNTitle / guideNText) so they translate per language.
const CLIENT_GUIDE_KEYS = ['guide1', 'guide2', 'guide3', 'guide4', 'guide5'];

const InfoTooltip = ({ text }: { text: string }) => {
  const [show, setShow] = React.useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button onClick={(e) => { e.stopPropagation(); setShow(!show); }} className="w-4 h-4 rounded-full bg-primary/10 text-primary/50 text-[8px] font-black inline-flex items-center justify-center hover:bg-primary/20 transition">i</button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)}></div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-primary text-white text-[10px] p-3 rounded-xl shadow-xl z-50 leading-relaxed">{text}<div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-primary"></div></div>
        </>
      )}
    </span>
  );
};

const CalculatorModal = ({ project, onClose }: { project: any; onClose: () => void }) => {
  const { t } = useTranslation();
  const { formatMoney } = useCurrency();
  const investmentAmount = Number(project.investment_amount) || 0;
  const annualRental = Number(project.annual_rental_projection) || 0;
  const marketPrice = Number(project.market_price) || 0;
  const baseYears = Number(project.years_contract) || 25;
  const extensionYears = Number(project.years_extension) || 0;
  const maxBaseYears = baseYears + extensionYears;
  const projCurrency = project.investment_currency || project.price_currency || 'EUR';
  const landRatio = (Number(project.land_ratio) || 30) / 100;
  const landBase = marketPrice * landRatio;
  const buildingValue = marketPrice * (1 - landRatio);
  const MAINTENANCE_PCT = 0.025;
  const DEFAULT_OPEX = 15;

  const [isAdvanced, setIsAdvanced] = useState(false);
  const [selectedYears, setSelectedYears] = useState(baseYears);
  const [extraYears, setExtraYears] = useState(0);
  const [maxAppreciation, setMaxAppreciation] = useState(150);
  const [occupancyRate, setOccupancyRate] = useState(80);
  const [inflationRate, setInflationRate] = useState(3);
  const [opexRate, setOpexRate] = useState(DEFAULT_OPEX);
  const [includeResale, setIncludeResale] = useState(true);

  const totalLeaseYears = maxBaseYears + extraYears;
  const displayYears = Math.min(selectedYears, totalLeaseYears);
  const totalDeductions = MAINTENANCE_PCT + (opexRate / 100);

  const getLandAppreciation = (year: number) => {
    const maxPct = maxAppreciation / 100;
    const k = 0.35;
    return maxPct * (1 - Math.exp(-k * year));
  };

  const calcYear = (year: number) => {
    const appreciation = getLandAppreciation(year);
    const landAppreciated = landBase * (1 + appreciation);
    const leaseRemaining = totalLeaseYears - year;
    const leaseFactor = leaseRemaining / totalLeaseYears;
    const landVal = landAppreciated * leaseFactor;
    const resaleValue = buildingValue + landVal;
    let cumulativeRentalGross = 0;
    let cumulativeRentalNet = 0;
    for (let j = 0; j < year; j++) {
      const yearlyGross = annualRental * (occupancyRate / 100) * Math.pow(1 + (inflationRate / 100), j);
      cumulativeRentalGross += yearlyGross;
      cumulativeRentalNet += yearlyGross * (1 - totalDeductions);
    }
    const totalReturn = cumulativeRentalNet + (includeResale ? resaleValue : 0) - investmentAmount;
    return { year, landVal, landAppreciated, leaseFactor, resaleValue, cumulativeRentalGross, cumulativeRentalNet, totalReturn };
  };

  const yearlyData = Array.from({ length: displayYears }, (_, i) => calcYear(i + 1));
  const last = yearlyData.length > 0 ? yearlyData[yearlyData.length - 1] : null;
  const totalRentalGross = last ? last.cumulativeRentalGross : 0;
  const totalRentalNet = last ? last.cumulativeRentalNet : 0;
  const resaleEnd = last ? last.resaleValue : 0;
  const totalReturn = last ? last.totalReturn : 0;
  const totalROI = investmentAmount > 0 ? ((totalReturn / investmentAmount) * 100) : 0;
  const annualizedROI = displayYears > 0 ? (totalROI / displayYears) : 0;
  const roiRental = investmentAmount > 0 ? ((totalRentalNet / investmentAmount) * 100) : 0;
  const roiResale = investmentAmount > 0 ? (((resaleEnd - investmentAmount) / investmentAmount) * 100) : 0;
  const maxChart = yearlyData.length > 0 ? Math.max(...yearlyData.map(d => d.cumulativeRentalNet + (includeResale ? d.resaleValue : 0))) : 1;
  const getPayback = () => {
    for (let i = 0; i < yearlyData.length; i++) {
      const curr = yearlyData[i];
      const currTotal = curr.cumulativeRentalNet + (includeResale ? curr.resaleValue : 0);
      if (currTotal >= investmentAmount * 2) {
        if (i === 0) {
          const ratio = (investmentAmount * 2) / currTotal;
          const months = Math.ceil(ratio * 12);
          return months < 12 ? t('admin.clientDash.paybackMonths', { count: months }) : t('admin.clientDash.paybackOneYear');
        }
        const prev = yearlyData[i - 1];
        const prevTotal = prev.cumulativeRentalNet + (includeResale ? prev.resaleValue : 0);
        const needed = investmentAmount * 2 - prevTotal;
        const yearGain = currTotal - prevTotal;
        const fraction = yearGain > 0 ? needed / yearGain : 0;
        const totalMonths = Math.round((curr.year - 1 + fraction) * 12);
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        if (years === 0) return t('admin.clientDash.paybackMonths', { count: months });
        if (months === 0) return t('admin.clientDash.paybackYears', { count: years });
        return t('admin.clientDash.paybackYearsMonths', {
          years: t('admin.clientDash.paybackYears', { count: years }),
          months: t('admin.clientDash.paybackMonths', { count: months }),
        });
      }
    }
    return null;
  };
  const paybackDisplay = getPayback();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white ust-modal rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 md:px-8 md:py-5 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
          <div>
            <h2 className="text-lg md:text-xl font-serif text-primary">{t('admin.clientDash.calcTitle')}</h2>
            <p className="text-xs md:text-sm text-primary/50">{project.project_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-primary transition">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 md:p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="bg-gray-100 rounded-full p-1 flex gap-1">
                <button onClick={() => setIsAdvanced(false)} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition ${!isAdvanced ? 'bg-primary text-white shadow' : 'text-primary/50 hover:text-primary'}`}>{t('admin.clientDash.calcSimple')}</button>
                <button onClick={() => setIsAdvanced(true)} className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition ${isAdvanced ? 'bg-primary text-white shadow' : 'text-primary/50 hover:text-primary'}`}>{t('admin.clientDash.calcAdvanced')}</button>
              </div>
            </div>

            <div className={`grid ${isAdvanced ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'} gap-3`}>
              <div className="bg-primary/5 p-4 rounded-xl">
                <p className="text-[9px] font-black uppercase text-primary/40 tracking-widest">{t('admin.clientDash.calcYourInvestment')}</p>
                <p className="text-lg font-serif text-primary">{formatMoney(investmentAmount, projCurrency)}</p>
              </div>
              <div className={`p-4 rounded-xl ${totalReturn >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-[9px] font-black uppercase tracking-widest ${totalReturn >= 0 ? 'text-green-600/60' : 'text-red-600/60'}`}>{t('admin.clientDash.calcNetProfit')} <InfoTooltip text={t('admin.clientDash.tooltipNetProfit')} /></p>
                <p className={`text-lg font-serif ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatMoney(totalReturn, projCurrency)}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-xl">
                <p className="text-[9px] font-black uppercase text-green-600/60 tracking-widest">{t('admin.clientDash.calcRoiRental')} <InfoTooltip text={t('admin.clientDash.tooltipRoiRental')} /></p>
                <p className="text-lg font-serif text-green-600">{roiRental.toFixed(0)}%</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl">
                <p className="text-[9px] font-black uppercase text-blue-600/60 tracking-widest">{t('admin.clientDash.calcRoiResale')} <InfoTooltip text={t('admin.clientDash.tooltipRoiResale')} /></p>
                <p className={`text-lg font-serif ${roiResale >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{roiResale.toFixed(0)}%</p>
              </div>
              {isAdvanced && (
                <div className="bg-purple-50 p-4 rounded-xl">
                  <p className="text-[9px] font-black uppercase text-purple-600/60 tracking-widest">{t('admin.clientDash.calcRoiAnnualized')} <InfoTooltip text={t('admin.clientDash.tooltipRoiAnnualized')} /></p>
                  <p className="text-lg font-serif text-purple-600">{annualizedROI.toFixed(1)}%</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50/50 border border-green-100 p-3 rounded-xl">
                <p className="text-[9px] font-black uppercase text-green-600/50 tracking-widest">{t('admin.clientDash.calcNetRentalShort', { years: displayYears })}</p>
                <p className="text-sm font-bold text-green-600">{formatMoney(totalRentalNet, projCurrency)}</p>
                {isAdvanced && <p className="text-[8px] text-green-600/40 mt-1">{t('admin.clientDash.calcGross', { value: formatMoney(totalRentalGross, projCurrency), pct: ((totalDeductions) * 100).toFixed(0) })}</p>}
              </div>
              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
                <p className="text-[9px] font-black uppercase text-blue-600/50 tracking-widest">{t('admin.clientDash.calcResaleValueYear', { year: displayYears })}</p>
                <p className="text-sm font-bold text-blue-600">{formatMoney(resaleEnd, projCurrency)}</p>
                {paybackDisplay && <p className="text-[8px] text-blue-600/40 mt-1">{t('admin.clientDash.calcPaybackEstimated', { value: paybackDisplay })}</p>}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{t('admin.clientDash.calcHorizon', { years: displayYears })}</p>
                <div className="flex gap-2 text-[8px] font-bold">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('admin.clientDash.calcChipContract', { years: baseYears })}</span>
                  {extensionYears > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t('admin.clientDash.calcChipExt', { years: extensionYears })}</span>}
                  {extraYears > 0 && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{t('admin.clientDash.calcChipExtra', { years: extraYears })}</span>}
                </div>
              </div>
              <div className="relative h-8 flex items-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-3 rounded-full overflow-hidden bg-gray-100 flex">
                    <div className="bg-green-400 h-full" style={{width: `${(baseYears / totalLeaseYears) * 100}%`}}></div>
                    <div className="bg-blue-400 h-full" style={{width: `${(extensionYears / totalLeaseYears) * 100}%`}}></div>
                    {extraYears > 0 && <div className="bg-orange-300 h-full" style={{width: `${(extraYears / totalLeaseYears) * 100}%`}}></div>}
                  </div>
                </div>
                <input type="range" min={1} max={totalLeaseYears} value={displayYears} onChange={(e) => setSelectedYears(parseInt(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10" />
                <div className="absolute h-6 w-6 bg-primary rounded-full shadow-lg border-2 border-white pointer-events-none z-20 flex items-center justify-center" style={{left: `calc(${((displayYears - 1) / Math.max(totalLeaseYears - 1, 1)) * 100}% - 12px)`}}>
                  <span className="text-white text-[8px] font-black">{displayYears}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">{t('admin.clientDash.calcExtraLeaseYears')}</p>
              <div className="flex gap-2">
                {[0, 5, 10, 15, 20].map(y => (
                  <button key={y} onClick={() => setExtraYears(y)} className={`px-3 py-2 rounded-lg text-xs font-bold transition ${extraYears === y ? 'bg-primary text-white' : 'bg-gray-100 text-primary/60 hover:bg-gray-200'}`}>+{y}</button>
                ))}
              </div>
            </div>

            {isAdvanced && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">{t('admin.clientDash.calcMaxLandAppreciation')}</p>
                    <input type="range" min={0} max={300} step={10} value={maxAppreciation} onChange={(e) => setMaxAppreciation(parseInt(e.target.value))} className="w-full" />
                    <p className="text-xs font-bold text-primary text-center">{maxAppreciation}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">{t('admin.clientDash.calcOccupancy')}</p>
                    <input type="range" min={0} max={100} step={5} value={occupancyRate} onChange={(e) => setOccupancyRate(parseInt(e.target.value))} className="w-full" />
                    <p className="text-xs font-bold text-primary text-center">{occupancyRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">{t('admin.clientDash.calcRentalInflation')}</p>
                    <input type="range" min={0} max={10} step={0.5} value={inflationRate} onChange={(e) => setInflationRate(parseFloat(e.target.value))} className="w-full" />
                    <p className="text-xs font-bold text-primary text-center">{inflationRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1">{t('admin.clientDash.calcOpex')}</p>
                    <input type="range" min={0} max={50} step={1} value={opexRate} onChange={(e) => setOpexRate(parseInt(e.target.value))} className="w-full" />
                    <p className="text-xs font-bold text-primary text-center">{opexRate}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{t('admin.clientDash.calcIncludeResale')}</p>
                    <p className="text-[8px] text-primary/30">{t('admin.clientDash.calcIncludeResaleHint')}</p>
                  </div>
                  <button onClick={() => setIncludeResale(!includeResale)} className={`relative w-12 h-6 rounded-full transition-colors ${includeResale ? 'bg-primary' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeResale ? 'left-7' : 'left-1'}`}></span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-3">{t('admin.clientDash.calcReturnEvolution')}</p>
              <div className="flex items-end gap-[2px] h-40 bg-gray-50 rounded-xl p-3">
                {yearlyData.map((d, i) => {
                  const rentalH = maxChart > 0 ? (d.cumulativeRentalNet / maxChart) * 100 : 0;
                  const resaleH = includeResale && maxChart > 0 ? (d.resaleValue / maxChart) * 100 : 0;
                  const totalH = rentalH + resaleH;
                  const scale = totalH > 100 ? 100 / totalH : 1;
                  const isBase = d.year <= baseYears;
                  const isExt = d.year > baseYears && d.year <= maxBaseYears;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 min-w-[6px] group relative">
                      <div className="w-full flex flex-col justify-end" style={{height: '120px'}}>
                        {includeResale && <div className={`w-full rounded-t-sm ${isBase ? 'bg-blue-400' : isExt ? 'bg-blue-300' : 'bg-blue-200'}`} style={{height: `${resaleH * scale}%`}}></div>}
                        <div className={`w-full ${!includeResale ? 'rounded-t-sm' : ''} ${isBase ? 'bg-green-400' : isExt ? 'bg-green-300' : 'bg-green-200'}`} style={{height: `${rentalH * scale}%`}}></div>
                      </div>
                      {(d.year === 1 || d.year === baseYears || d.year === maxBaseYears || d.year === totalLeaseYears || d.year % 5 === 0) && (
                        <span className="text-[7px] text-primary/30 mt-1">{d.year}</span>
                      )}
                      {isAdvanced && (
                        <div className="absolute bottom-full mb-2 bg-primary text-white text-[8px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-30">
                          {includeResale
                            ? t('admin.clientDash.calcChartYearTooltipResale', { year: d.year, net: formatMoney(d.cumulativeRentalNet, projCurrency), resale: formatMoney(d.resaleValue, projCurrency) })
                            : t('admin.clientDash.calcChartYearTooltip', { year: d.year, net: formatMoney(d.cumulativeRentalNet, projCurrency) })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1 text-[8px] text-primary/50"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block"></span> {t('admin.clientDash.calcLegendNetRental')}</span>
                {includeResale && <span className="flex items-center gap-1 text-[8px] text-primary/50"><span className="w-3 h-3 bg-blue-400 rounded-sm inline-block"></span> {t('admin.clientDash.calcLegendResale')}</span>}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">{t('admin.clientDash.calcBreakdownTitle', { years: displayYears })}</p>
              <div className="flex justify-between text-sm">
                <span className="text-primary/60">{t('admin.clientDash.calcGrossRentalAccum')}</span>
                <span className="font-bold text-primary/70">{formatMoney(totalRentalGross, projCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary/60">{t('admin.clientDash.calcMaintenance')}</span>
                <span className="font-bold text-red-400">-{formatMoney(totalRentalGross * MAINTENANCE_PCT, projCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary/60">{t('admin.clientDash.calcOpexLine', { pct: opexRate })}</span>
                <span className="font-bold text-red-400">-{formatMoney(totalRentalGross * (opexRate / 100), projCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-primary/60">{t('admin.clientDash.calcNetRentalAccum')}</span>
                <span className="font-bold text-green-600">{formatMoney(totalRentalNet, projCurrency)}</span>
              </div>
              {includeResale && (
                <>
                  <div className="border-t border-gray-200 my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-primary/60">{t('admin.clientDash.calcResaleEstimatedYear', { year: displayYears })}</span>
                    <span className="font-bold text-blue-600">{formatMoney(resaleEnd, projCurrency)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="font-bold text-primary">{t('admin.clientDash.calcNetProfitEstimated')}</span>
                <span className={`font-black text-lg ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatMoney(totalReturn, projCurrency)}</span>
              </div>
              {paybackDisplay && (
                <div className="flex justify-between text-sm">
                  <span className="text-primary/60">{t('admin.clientDash.calcPaybackLine')}</span>
                  <span className="font-bold text-primary">{paybackDisplay}</span>
                </div>
              )}
              {isAdvanced && includeResale && (
                <>
                  <div className="border-t border-gray-200 my-2"></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-primary/60">{t('admin.clientDash.calcLandYear', { year: displayYears, appr: (getLandAppreciation(displayYears) * 100).toFixed(0), lease: (last ? (last.leaseFactor * 100).toFixed(0) : 0) })}</span>
                    <span className="font-bold text-primary">{formatMoney(last ? last.landVal : 0, projCurrency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-primary/60">{t('admin.clientDash.calcBuildingYear', { year: displayYears })}</span>
                    <span className="font-bold text-primary">{formatMoney(buildingValue, projCurrency)}</span>
                  </div>
                </>
              )}
              {!isAdvanced && (
                <p className="text-[8px] text-primary/30 mt-2 italic">{t('admin.clientDash.calcDefaultsNote')}</p>
              )}
            </div>

            <p className="text-[8px] text-primary/30 text-center italic leading-relaxed">{t('admin.clientDash.calcDisclaimer', { opex: opexRate })}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClientDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  useEffect(() => { document.title = t('admin.clientDash.pageTitle'); }, [t]);
  const dateLocale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'ro' ? 'ro-RO' : 'es-ES';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatMoney } = useCurrency();

  const [clientData, setClientData] = useState<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allProjects, setAllProjects] = useState<Record<string, any>>({});
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  const [calculatorProject, setCalculatorProject] = useState<any>(null);
  const [paymentsProj, setPaymentsProj] = useState<any>(null);
  // Funciones visibles del portal (admin las activa/desactiva en Configuración).
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('app_config').select('value').eq('key', 'brand').maybeSingle();
      setFeatures(((data?.value as any)?.client_features) || {});
    })();
  }, []);
  const feat = (k: string) => features[k] !== false; // por defecto visible

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  // Resuelve el id de cliente desde la sesión Supabase Auth (no del token
  // legacy _ust_client_). null si no hay sesión o la cuenta no es cliente.
  const resolveClientId = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase.rpc('client_my_id');
    return (data && data.success) ? (data.client_id as string) : null;
  };

  const loadDashboard = useCallback(async (cid: string) => {
    try {
      const { data, error } = await supabase.rpc('client_get_dashboard', { p_client_id: cid });
      if (error || !data || !data.success) {
        navigate('/cliente');
        return;
      }
      setClientData(data);
      // Idioma del portal = el preferido del cliente (el mismo de sus emails).
      const lang = data?.client?.preferred_language;
      if (lang && ['es', 'en', 'ro', 'id'].includes(lang) && i18n.language !== lang) void i18n.changeLanguage(lang);

      // Fetch all projects to ensure we have all fields (like URLs)
      const { data: projectsData } = await supabase.from('projects').select('*');
      if (projectsData) {
          const projMap: Record<string, any> = {};
          projectsData.forEach((p: any) => projMap[p.id] = p);
          setAllProjects(projMap);
      }

    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const id = await resolveClientId();
      if (!id) { navigate('/cliente'); return; }
      setClientId(id);
      await loadDashboard(id);
      if (searchParams.get('change_password') === 'true') {
        setShowChangePassword(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, loadDashboard, searchParams]);

  useEffect(() => {
    if (!localStorage.getItem('unreal_client_guide_seen')) {
      setWalkthroughStep(0);
    }
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (passwords.newPass !== passwords.confirm) {
      setPasswordError(t('admin.clientDash.passwordsNoMatch'));
      return;
    }
    if (passwords.newPass.length < 6) {
      setPasswordError(t('admin.clientDash.passwordTooShort'));
      return;
    }
    if (!clientId) return;
    try {
      // La contraseña real vive en Supabase Auth → la cambiamos ahí.
      const { error: authErr } = await supabase.auth.updateUser({ password: passwords.newPass });
      if (authErr) {
        setPasswordError(t('admin.clientDash.passwordChangeError'));
        return;
      }

      // Reflejamos en clients para que el admin siga viendo la última contraseña.
      await supabase.from('clients').update({
        temp_password: passwords.newPass,
        password_plain: passwords.newPass,
        must_change_password: false,
      }).eq('id', clientId);

      setPasswordSuccess(t('admin.clientDash.passwordChangeSuccess'));
      setPasswords({ current: '', newPass: '', confirm: '' });
      setTimeout(() => { setShowChangePassword(false); setPasswordSuccess(''); }, 2000);
    } catch (err) {
      setPasswordError(t('admin.clientDash.passwordChangeError'));
    }
  };

  // El selector de idioma vive SOLO en la cabecera (pastillas ES/EN/RO/ID). Aquí
  // persistimos el idioma elegido en la preferencia del cliente (sus emails/kwitansi
  // van en ese idioma), que es lo que hacía el selector duplicado ya retirado del cuerpo.
  useEffect(() => {
    if (!clientData) return;
    const pref = clientData?.client?.preferred_language;
    const lang = i18n.language;
    if (['es', 'en', 'ro', 'id'].includes(lang) && lang !== pref) {
      void supabase.rpc('client_set_my_language', { p_lang: lang });
    }
  }, [i18n.language, clientData]);

  const handleLogout = async () => {
    // Cliente usa token propio (_ust_client_); cerramos también sesión Supabase
    // por si existiera, y redirect DURO para garantizar estado limpio.
    localStorage.removeItem('_ust_client_');
    sessionStorage.removeItem('_ust_client_');
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/cliente';
  };

  const finishWalkthrough = () => {
    localStorage.setItem('unreal_client_guide_seen', 'true');
    setWalkthroughStep(null);
  };

  const nextGuideStep = () => {
    if (walkthroughStep !== null && walkthroughStep < CLIENT_GUIDE_KEYS.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else {
      finishWalkthrough();
    }
  };

  const prevGuideStep = () => {
    if (walkthroughStep !== null && walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">{t('admin.clientDash.loading')}</p>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="min-h-screen bg-almond flex items-center justify-center">
        <p className="text-primary/50">{t('admin.clientDash.errorLoad')} <button onClick={handleLogout} className="underline">{t('admin.clientDash.backToLogin')}</button></p>
      </div>
    );
  }

  const client = clientData.client || {};
  const projects = (clientData.projects || []).map((cp: any) => {
      const full = allProjects[cp.project_id] || {};
      return {
          ...full,
          ...cp,
          project_image: full.image || cp.project_image,
          project_name: full.name || cp.project_name,
          project_location: full.location || cp.project_location,
          project_slug: full.slug || full.id
      };
  });
  
  const getTotalConverted = () => {
    // Suma por divisa, SIN convertir: cada inversión se queda en su moneda.
    // Si el cliente invirtió en varias divisas, se muestran sumadas por separado
    // (p.ej. "85.000 € + 138.889 $"), nunca reconvertidas a una sola.
    const byCurrency: Record<string, number> = {};
    projects.forEach((p: any) => {
      const amt = Number(p.investment_amount) || 0;
      if (!amt) return;
      const cur = p.investment_currency || 'EUR';
      byCurrency[cur] = (byCurrency[cur] || 0) + amt;
    });
    const parts = Object.entries(byCurrency).map(([cur, amt]) => formatMoney(amt, cur as any));
    return parts.length ? parts.join(' + ') : formatMoney(0, 'EUR');
  };

  const getWeightedRentalROI = () => {
    const withRoi = projects.filter((p: any) => p.annual_rental_projection && p.investor_price);
    if (withRoi.length === 0) return '—';
    const weightedSum = withRoi.reduce((sum: number, p: any) => sum + (p.annual_rental_projection / p.investor_price) * Number(p.investment_amount), 0);
    const totalWeight = withRoi.reduce((sum: number, p: any) => sum + Number(p.investment_amount), 0);
    return totalWeight > 0 ? ((weightedSum / totalWeight) * 100).toFixed(1) + '%' : '—';
  };

  const totalInvested = projects.reduce((sum: number, p: any) => sum + (Number(p.investment_amount) || 0), 0);

  return (
    <div className="min-h-screen bg-almond">
      {/* Header unificado del sitio */}
      <PortalHeader
        onLogout={handleLogout}
        extra={
          <>
            <button onClick={() => setWalkthroughStep(0)} className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">help</span> {t('admin.common.viewGuide')}
            </button>
            <button onClick={() => setShowChangePassword(true)} className="text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">lock</span> {t('admin.clientDash.passwordLabel')}
            </button>
          </>
        }
      />

      {walkthroughStep !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative animate-in zoom-in-95 duration-300 mx-4 border border-gray-100">
            <button onClick={() => finishWalkthrough()} className="absolute top-4 right-4 text-gray-400 hover:text-primary transition" title={t('admin.clientDash.closeGuide')}>
              <span className="material-symbols-outlined">close</span>
            </button>
            <div className="mb-6">
              <span className="text-[10px] font-black uppercase text-primary/40 tracking-widest block mb-2">{t('admin.clientDash.stepLabel', { n: walkthroughStep + 1, total: CLIENT_GUIDE_KEYS.length })}</span>
              <h2 className="text-2xl font-serif text-primary mb-4 leading-tight">{t(`admin.clientDash.${CLIENT_GUIDE_KEYS[walkthroughStep]}Title`)}</h2>
              <p className="text-primary/70 text-sm font-medium leading-relaxed">{t(`admin.clientDash.${CLIENT_GUIDE_KEYS[walkthroughStep]}Text`)}</p>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <div className="flex gap-2">
                {CLIENT_GUIDE_KEYS.map((_: any, i: number) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i === walkthroughStep ? 'bg-primary' : 'bg-gray-200'}`} />
                ))}
              </div>
              <div className="flex gap-3">
                {walkthroughStep > 0 && (
                  <button onClick={prevGuideStep} className="text-primary font-bold text-xs uppercase tracking-widest hover:text-primary/70 px-2">{t('admin.clientDash.prev')}</button>
                )}
                <button onClick={nextGuideStep} className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all">
                  {walkthroughStep < CLIENT_GUIDE_KEYS.length - 1 ? t('admin.clientDash.next') : t('admin.clientDash.finish')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <p className="text-sm text-primary/60 font-medium mb-6">
          {t('admin.clientDash.welcome', 'Bienvenido a Unreal Studio')}, <span className="text-primary font-bold">{(client.name || '').trim().split(' ')[0]}</span>
        </p>
        {client.drive_folder_url && feat('drive') && (
          <a href={client.drive_folder_url} target="_blank" rel="noopener noreferrer"
             className="mb-8 flex items-center gap-3 bg-white border border-primary/10 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition group">
            <svg width="34" height="34" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.3 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
            <div className="flex-1">
              <p className="font-serif text-lg text-primary leading-tight">{t('admin.clientDash.documentsTitle', 'Tu carpeta de Google Drive')}</p>
              <p className="text-xs text-primary/50">{t('admin.clientDash.documentsBody', 'Accede a tu carpeta privada (contratos, recibos, planos).')}</p>
            </div>
            <span className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-lg group-hover:bg-black transition shrink-0">Acceder <span className="material-symbols-outlined text-sm">arrow_forward</span></span>
          </a>
        )}
        {clientId && <ClientUnitsSection clientId={clientId} />}
        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">{t('admin.clientDash.kpiInvested')}</p>
            <p className="text-3xl font-serif text-primary">{getTotalConverted()}</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">{t('admin.clientDash.kpiProjects')}</p>
            <p className="text-3xl font-serif text-primary">{projects.length}</p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-primary/5">
            <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-2">{t('admin.clientDash.kpiStatus')}</p>
            <p className="text-3xl font-serif text-primary">{projects.length > 0 ? t('admin.clientDash.statusActive') : t('admin.clientDash.statusNoInvestments')}</p>
          </div>
        </div>

        {/* Proyectos */}
        <h2 className="text-2xl font-serif text-primary mb-8">{t('admin.clientDash.myInvestments')}</h2>
        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-primary/5">
            <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">home_work</span>
            <p className="text-primary/40 font-bold">{t('admin.clientDash.noProjectsTitle')}</p>
            <p className="text-primary/30 text-sm mt-2">{t('admin.clientDash.noProjectsBody')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {projects.map((proj: any, idx: number) => (
              <div key={idx} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-primary/5">
                <div className="flex flex-col lg:flex-row">
                  {proj.project_image && (
                    <div className="w-full lg:w-64 h-48 lg:h-auto shrink-0">
                      <img src={getImageUrl(proj.project_image)} className="w-full h-full object-cover" alt={proj.project_name} />
                    </div>
                  )}
                  <div className="p-6 md:p-8 flex-1">
                    <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-2">
                      <div>
                        <h3 className="text-xl font-bold text-primary">
                          <Link to={`/proyecto/${proj.project_slug}`} className="hover:underline">{proj.project_name}</Link>
                        </h3>
                        <p className="text-sm text-primary/50">{proj.project_location}</p>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${proj.status === 'Completado' ? 'bg-green-50 text-green-600' : proj.status === 'Pagado' ? 'bg-blue-50 text-blue-600' : 'bg-yellow-50 text-yellow-600'}`}>{proj.status}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      {proj.unit_number && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelUnit')}</p>
                          <p className="text-sm font-bold text-primary">{proj.unit_number}</p>
                        </div>
                      )}
                      {proj.investment_amount > 0 && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelInvestment')}</p>
                          <p className="text-sm font-bold text-primary">{formatMoney(Number(proj.investment_amount), proj.investment_currency || 'EUR')}</p>
                        </div>
                      )}
                      {proj.purchase_date && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelPurchaseDate')}</p>
                          <p className="text-sm font-bold text-primary">{formatDate(proj.purchase_date)}</p>
                        </div>
                      )}
                      {proj.completion_percent !== undefined && (
                        <div>
                          <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelConstructionProgress')}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-primary h-full rounded-full" style={{ width: `${proj.completion_percent}%` }}></div>
                            </div>
                            <span className="text-sm font-bold text-primary">{proj.completion_percent}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {(proj.annual_rental_projection || proj.market_price) && (
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                        {proj.annual_rental_projection && proj.investor_price && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelRoiRentalProjected')}</p>
                            <p className="text-sm font-bold text-green-600">{((proj.annual_rental_projection / proj.investor_price) * 100).toFixed(1)}% <span className="text-[9px] text-primary/40">{t('admin.clientDash.grossPerYear')}</span></p>
                          </div>
                        )}
                        {proj.market_price && proj.investor_price && proj.market_price > proj.investor_price && (
                          <div>
                            <p className="text-[9px] font-black uppercase text-primary/30 tracking-widest">{t('admin.clientDash.labelRoiResaleProjected')}</p>
                            <p className="text-sm font-bold text-blue-600">{(((proj.market_price - proj.investor_price) / proj.investor_price) * 100).toFixed(1)}% <span className="text-[9px] text-primary/40">{t('admin.clientDash.capitalGain')}</span></p>
                          </div>
                        )}
                      </div>
                    )}

                    {(proj.brochure_url || proj.construction_update_url || proj.project_slug) && (
                      <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-gray-100">
                          {proj.brochure_url && feat('brochure') && (
                              <a href={getImageUrl(proj.brochure_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-primary/5 hover:bg-primary hover:text-white text-primary px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition">
                                  <span className="material-symbols-outlined text-sm">download</span> {t('admin.clientDash.btnBrochure')}
                              </a>
                          )}
                          {proj.construction_update_url && feat('construction') && (
                              <a href={getImageUrl(proj.construction_update_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-green-50 hover:bg-green-600 hover:text-white text-green-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition">
                                  <span className="material-symbols-outlined text-sm">construction</span> {t('admin.clientDash.btnConstructionReport')}
                                  {proj.construction_update_date && <span className="text-[8px] opacity-70 ml-1">({formatDate(proj.construction_update_date)})</span>}
                              </a>
                          )}
                          {proj.project_slug && feat('viewProject') && (
                              <Link to={`/proyecto/${proj.project_slug}`} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-primary/20 text-primary text-xs font-bold uppercase hover:bg-primary hover:text-white transition">
                                  <span className="material-symbols-outlined text-sm">visibility</span> {t('admin.clientDash.btnViewProject')}
                              </Link>
                          )}
                          {feat('calculator') && (
                          <button onClick={() => setCalculatorProject(proj)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary/5 text-primary text-xs font-bold uppercase hover:bg-primary hover:text-white transition">
                            <span className="material-symbols-outlined text-sm">calculate</span> {t('admin.clientDash.btnCalculator')}
                          </button>
                          )}
                      </div>
                    )}
                    {clientId && (
                      <div className="mt-5 pt-5 border-t border-gray-100">
                        <button onClick={() => setPaymentsProj(proj)} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest hover:bg-black transition">
                          <span className="material-symbols-outlined text-sm">event</span> Calendario de pagos
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contacto */}
        <div className="mt-16 bg-primary text-white rounded-2xl p-10 text-center">
          <h3 className="text-2xl font-serif mb-4">{t('admin.clientDash.helpTitle')}</h3>
          <p className="text-white/70 text-sm mb-6">{t('admin.clientDash.helpBody')}</p>
          <a href={`https://wa.me/34625710770?text=${encodeURIComponent(t('admin.clientDash.whatsappMessage'))}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white text-primary px-8 py-4 rounded-xl font-bold text-sm hover:brightness-95 transition">
            <span className="material-symbols-outlined">chat</span> {t('admin.clientDash.helpWhatsapp')}
          </a>
        </div>
      </main>

      <Footer />

      {calculatorProject && <CalculatorModal project={calculatorProject} onClose={() => setCalculatorProject(null)} />}

      {paymentsProj && clientId && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setPaymentsProj(null); }}>
          <div className="bg-white ust-modal rounded-3xl p-6 md:p-8 shadow-2xl">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-xl font-serif text-primary">Calendario de pagos</h2>
                <p className="text-sm text-primary/50">{paymentsProj.project_name}{paymentsProj.unit_number ? ` · ${paymentsProj.unit_number}` : ''}</p>
              </div>
              <button onClick={() => setPaymentsProj(null)} className="text-primary/40 hover:text-primary" title="Cerrar"><span className="material-symbols-outlined">close</span></button>
            </div>
            <p className="text-xs text-primary/50 mb-4">La fecha límite es el día en que el importe debe estar recibido por Unreal Studio. Inicia las transferencias con margen.</p>
            <ClientPaymentsSection clientId={clientId} filterName={paymentsProj.project_name} filterUnit={paymentsProj.unit_number ?? null} variant="table" />
          </div>
        </div>
      )}

      {/* Modal Cambiar Contraseña */}
      {showChangePassword && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowChangePassword(false); }}>
          <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl">
            <h2 className="text-xl font-serif text-primary mb-6">{t('admin.clientDash.changePasswordTitle')}</h2>
            {passwordError && <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl mb-4">{passwordError}</div>}
            {passwordSuccess && <div className="bg-green-50 text-green-600 text-sm font-bold p-3 rounded-xl mb-4">{passwordSuccess}</div>}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.clientDash.currentPassword')}</label><input type="password" required value={passwords.current} onChange={(e) => setPasswords({...passwords, current: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.clientDash.newPassword')}</label><input type="password" required value={passwords.newPass} onChange={(e) => setPasswords({...passwords, newPass: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-2">{t('admin.clientDash.confirmPassword')}</label><input type="password" required value={passwords.confirm} onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold" /></div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs">{t('admin.clientDash.changeBtn')}</button>
                <button type="button" onClick={() => setShowChangePassword(false)} className="flex-1 bg-red-50 text-red-600 py-4 rounded-xl font-bold uppercase tracking-widest text-xs">{t('admin.clientDash.closeBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;