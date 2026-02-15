import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PenLine } from 'lucide-react'
import GlassContainer from '../../components/glass/GlassContainer'
import GlassButton from '../../components/glass/GlassButton'
import GlassTextField from '../../components/glass/GlassTextField'
import GlassIconButton from '../../components/glass/GlassIconButton'
import type { Asset, AssetType, AssetSector } from '../../types'
import {
  ASSET_TYPE_LABELS, SECTOR_LABELS, BROKERAGES, CURRENCIES,
} from '../../types'
import './AddAsset.css'

export default function AddManualAssetScreen() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [assetType, setAssetType] = useState<AssetType>('stock')
  const [quantity, setQuantity] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [brokerage, setBrokerage] = useState('')
  const [sector, setSector] = useState<AssetSector>('other')
  const [country, setCountry] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  const handleAdd = () => {
    if (!name || !quantity || !costBasis || !currentPrice) return
    const asset: Asset = {
      id: crypto.randomUUID(),
      name, symbol: symbol || undefined,
      type: assetType, category: 'manual',
      quantity: parseFloat(quantity),
      costBasis: parseFloat(costBasis),
      currentPrice: parseFloat(currentPrice),
      currency, brokerage: brokerage || undefined,
      sector, country: country || undefined,
      notes: notes || undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const portfolio = JSON.parse(localStorage.getItem('finocure-portfolio') || '{}')
    portfolio.assets = [...(portfolio.assets || []), asset]
    portfolio.updatedAt = new Date().toISOString()
    localStorage.setItem('finocure-portfolio', JSON.stringify(portfolio))
    navigate('/main', { replace: true })
  }

  return (
    <div className="add-asset-screen">
      <div className="add-asset-bg-glow add-asset-bg-glow--1" />
      <div className="add-asset-bg-glow add-asset-bg-glow--2" />
      <div className={`add-asset-content ${visible ? 'add-asset-content--visible' : ''}`}>
        <div className="add-asset-header">
          <GlassIconButton icon={<ArrowLeft size={20} />} onClick={() => navigate(-1)} size={44} />
        </div>
        <GlassContainer>
          <h1 className="add-asset-title">Add Manual Asset</h1>
          <p className="add-asset-subtitle">Enter the details of your holding</p>

          <div className="add-asset-form">
            <div>
              <label className="add-asset-label">Name *</label>
              <GlassTextField value={name} onChange={setName} placeholder="e.g. Rental Property" prefixIcon={<PenLine size={16} />} />
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Symbol (optional)</label>
                <GlassTextField value={symbol} onChange={setSymbol} placeholder="e.g. AAPL" />
              </div>
              <div>
                <label className="add-asset-label">Asset Type</label>
                <select className="add-asset-select" value={assetType} onChange={e => setAssetType(e.target.value as AssetType)}>
                  {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map(t => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Quantity *</label>
                <GlassTextField value={quantity} onChange={setQuantity} placeholder="1" type="number" />
              </div>
              <div>
                <label className="add-asset-label">Total Cost Basis *</label>
                <GlassTextField value={costBasis} onChange={setCostBasis} placeholder="0.00" type="number" />
              </div>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Current Price *</label>
                <GlassTextField value={currentPrice} onChange={setCurrentPrice} placeholder="0.00" type="number" />
              </div>
              <div>
                <label className="add-asset-label">Currency</label>
                <select className="add-asset-select" value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="add-asset-row">
              <div>
                <label className="add-asset-label">Sector</label>
                <select className="add-asset-select" value={sector} onChange={e => setSector(e.target.value as AssetSector)}>
                  {(Object.keys(SECTOR_LABELS) as AssetSector[]).map(s => (
                    <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="add-asset-label">Brokerage</label>
                <select className="add-asset-select" value={brokerage} onChange={e => setBrokerage(e.target.value)}>
                  <option value="">None</option>
                  {BROKERAGES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="add-asset-label">Country</label>
              <GlassTextField value={country} onChange={setCountry} placeholder="e.g. US" />
            </div>

            <div>
              <label className="add-asset-label">Notes</label>
              <GlassTextField value={notes} onChange={setNotes} placeholder="Any notes..." maxLines={3} />
            </div>

            <div>
              <label className="add-asset-label">Tags (comma-separated)</label>
              <GlassTextField value={tags} onChange={setTags} placeholder="e.g. growth, tech" />
            </div>

            <div className="add-asset-actions">
              <GlassButton text="Cancel" onClick={() => navigate(-1)} />
              <GlassButton
                text="Add to Portfolio"
                onClick={handleAdd}
                isPrimary
                disabled={!name || !quantity || !costBasis || !currentPrice}
              />
            </div>
          </div>
        </GlassContainer>
      </div>
    </div>
  )
}
