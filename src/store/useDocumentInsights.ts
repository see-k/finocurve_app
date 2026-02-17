import { useState, useCallback } from 'react'
import type { DocumentInsight } from '../ai/types'

export function useDocumentInsights() {
  const [insights, setInsights] = useState<DocumentInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDocumentInsights = useCallback((newInsights: DocumentInsight[]) => {
    setInsights(newInsights)
    setError(null)
  }, [])

  const clearInsights = useCallback(() => {
    setInsights([])
    setError(null)
  }, [])

  return {
    insights,
    setDocumentInsights,
    clearInsights,
    loading,
    setLoading,
    error,
    setError,
  }
}

/** Shared store for document insights - used by ReportsScreen and RiskAnalysisScreen */
let sharedInsights: DocumentInsight[] = []

export function getSharedDocumentInsights(): DocumentInsight[] {
  return sharedInsights
}

export function setSharedDocumentInsights(insights: DocumentInsight[]): void {
  sharedInsights = insights
}
