import type { ParsedTx } from './ofx'

const CM_CATS: Record<string, string[]> = {
  'Courses':['CARREFOUR','LEADER PRICE','CASINO','LECLERC','INTERMARCHE','LIDL','ALDI','MONOPRIX','SUPERMARCHE','MARCHE'],
  'Loyer':['LOYER','GESTIMMO','IMMOBILIER','SCI','SYNDIC','HABITAT'],
  'Santé':['PHARMACIE','PHIE','MUTUELLE','COMPLEMENTAIRE SANTE','CGSS','MEDECIN','CPAM','SECU'],
  'Assurance':['ASSURANCE','HABITATION','AUTO','MMA','AXA','ALLIANZ','MAIF'],
  'Abonnement':['EDF','SGDE','ENEDIS','VEOLIA','EAU','GAZ','ORANGE','FREE','SFR','BOUYGUES','NETFLIX','SPOTIFY','AMAZON'],
  'Transport':['SNCF','RATP','UBER','TAXI','ESSENCE','TOTAL','BP','SHELL','CARBURANT'],
  'Banque':['COTIS','FRAIS','AGIOS','COMMISSION'],
  'Restaurant':['RESTAURANT','BRASSERIE','SNACK','PIZZA','BURGER','SUSHI'],
  'Sport':['FITNESS','SALLE DE SPORT','GYM','PISCINE'],
};

const CM_ICONS: Record<string,string>={'Courses':'🛒','Loyer':'🏠','Santé':'💊','Assurance':'🛡️','Abonnement':'📱','Transport':'🚗','Banque':'🏦','Restaurant':'🍽️','Sport':'💪','Virement':'💸','Prélèvement':'🏦','Salaire':'💰','Autre':'📦'};

function catFromKeywords(libelle: string, catMap: Record<string, string[]>): string {
  const l=libelle.toUpperCase();
  for(const[cat,kws] of Object.entries(catMap)){
    if(kws.some(k=>l.includes(k)))return cat;
  }
  return 'Autre';
}

function stripQuotes(s: string): string { return s.trim().replace(/^["']|["']$/g,''); }

function parseCMDate(raw: string): string|null {
  // DD/MM/YYYY or YYYY-MM-DD
  const s=raw.trim();
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const[d,m,y]=s.split('/');return `${y}-${m}-${d}`;}
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return null;
}

export function parseCM(text: string): ParsedTx[] {
  // Strip BOM
  const clean=text.replace(/^﻿/,'');
  const lines=clean.split('\n').map(l=>l.trimEnd()).filter(Boolean);
  const txs: ParsedTx[]=[];

  // Detect format from header row
  const header=lines[0]?lines[0].split(';').map(stripQuotes).map(h=>h.toLowerCase()):[];
  // Format A: Date;Valeur;Montant;Libellé;Solde (5 cols, signed amount at col 2)
  // Format B: Date;DateValeur;Débit;Crédit;Libellé;Solde (6 cols, separate debit/credit)
  // Format C: Date;DateValeur;Montant;Libellé;Référence;IBAN;Solde;Catégorie (8 cols)
  // Auto-detect: look for header keywords or fall back to column count heuristic

  const hasDebitCredit=header.some(h=>h.includes('débit')||h.includes('debit'));
  const amtIdx=header.findIndex(h=>h.includes('montant'));
  const libIdx=header.findIndex(h=>h.includes('libel')||h.includes('opération')||h.includes('operation'));
  const debitIdx=header.findIndex(h=>h.includes('débit')||h.includes('debit'));
  const creditIdx=header.findIndex(h=>h.includes('crédit')||h.includes('credit'));
  const catIdx=header.findIndex(h=>h.includes('catégor')||h.includes('categor'));

  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(';').map(stripQuotes);
    if(cols.length<3)continue;

    const dateRaw=cols[0];
    const dt=parseCMDate(dateRaw);
    if(!dt)continue;

    let libelle='';
    let amount=NaN;

    if(header.length>=3){
      // Use header-detected indices
      libelle=libIdx>=0&&cols[libIdx]?cols[libIdx]:'';
      if(hasDebitCredit&&debitIdx>=0&&creditIdx>=0){
        const d=cols[debitIdx]?.replace(',','.').replace('+','');
        const c=cols[creditIdx]?.replace(',','.').replace('+','');
        if(d&&parseFloat(d))amount=-Math.abs(parseFloat(d));
        else if(c&&parseFloat(c))amount=Math.abs(parseFloat(c));
      }else if(amtIdx>=0&&cols[amtIdx]){
        amount=parseFloat(cols[amtIdx].replace(',','.').replace('+',''));
      }
      // fallback if indices not found
      if(!libelle)libelle=cols[3]||cols[2]||'';
      if(isNaN(amount)&&cols[2])amount=parseFloat(cols[2].replace(',','.').replace('+',''));
    }else{
      // No header — column count heuristic
      if(cols.length>=5){libelle=cols[3];amount=parseFloat(cols[2].replace(',','.').replace('+',''));}
      else if(cols.length>=4){libelle=cols[2];amount=parseFloat(cols[1].replace(',','.').replace('+',''));}
    }

    libelle=libelle.trim();
    if(!libelle||isNaN(amount)||amount===0)continue;

    const cmCat=catIdx>=0&&cols[catIdx]?cols[catIdx]:'';
    let cat='Autre';
    if(cmCat&&!['A catégoriser','Hors budget',''].includes(cmCat)){
      if(cmCat.includes('Santé'))cat='Santé';
      else if(cmCat.includes('Virement'))cat='Virement';
      else if(cmCat.includes('Frais'))cat='Banque';
      else if(cmCat.includes('Logement'))cat='Loyer';
      else if(cmCat.includes('Assurance'))cat='Assurance';
      else cat=catFromKeywords(libelle,CM_CATS);
    }else{
      cat=catFromKeywords(libelle,CM_CATS);
      if(cat==='Autre'){
        if(libelle.toUpperCase().includes('VIREMENT')||libelle.toUpperCase().includes('VIR SEPA'))cat='Virement';
        else if(libelle.toUpperCase().includes('PRELEVEMENT')||libelle.toUpperCase().includes('PRLV'))cat='Prélèvement';
        else if(libelle.toUpperCase().includes('SALAIRE'))cat='Salaire';
      }
    }
    txs.push({dt,merchant:libelle.slice(0,80),category:cat,icon:CM_ICONS[cat]||'📦',amount});
  }
  return txs;
}
