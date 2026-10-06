package it.unina.bugboard26.reporting.domain;

public record ResolutionSummary(long resolutionCount, long resolvedIssueCount,
                                Double averageResolutionSeconds) { }
