# RNBS-Coin Architecture

## System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         RNBS-Coin Network                         │
└───────────────────────────────────────────────────────────────────┘
                   ▲                           ▲
                   │                           │
                   │                           │
┌──────────────────┴───────────────┐ ┌─────────┴────────────────────┐
│                                  │ │                              │
│           Wallet Layer           │ │         Agent Layer          │
│       (Key & Coin Management)    │ │    (Validation & Security)   │
│                                  │ │                              │
└──────────────────┬───────────────┘ └─────────┬────────────────────┘
                   │                           │
                   │                           │
                   ▼                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                         Transaction Layer                         │
└───────────────────────────────────────────────────────────────────┘
```

## Transaction Flow

```
┌───────────┐         ┌───────────┐         ┌───────────┐         ┌───────────┐
│           │         │           │         │           │         │           │
│   Wallet  │ ──────> │  Network  │ ──────> │  Witness  │ ──────> │    Coin   │
│  (Sender) │         │  (Router) │         │  (Agents) │         │ (Transfer)│
│           │         │           │         │           │         │           │
└───────────┘         └───────────┘         └───────────┘         └───────────┘
                            │                     │                     │
                            │                     │                     │
                            ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                                                                               │
│                       Reputation-Based Witness Selection                      │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Reputation System

```
┌───────────────┐     ┌───────────────────────────────────────┐     ┌───────────────┐
│               │     │                                       │     │               │
│   Successful  │────▶│              Reputation               │────▶│   Weighted    │
│  Validations  │     │                Score                  │     │    Witness    │
│               │     │           (Range: 0-100)              │     │   Selection   │
│               │     │                                       │     │               │
└───────────────┘     └───────────────────────────────────────┘     └───────────────┘
       ▲                              ▲                                     │
       │                              │                                     │
       │                              │                                     │
       │                              │                                     ▼
┌──────┴──────────┐    ┌──────────────┴───────────────┐           ┌───────────────────┐
│                 │    │                              │           │                   │
│Double-Spend     │    │   Malicious Activity         │           │     Quorum        │
│Detection        │    │   Penalties                  │           │    Validation     │
│(+2.0 points)    │    │   (-2.0 points)              │           │                   │
│                 │    │                              │           │                   │
└─────────────────┘    └──────────────────────────────┘           └───────────────────┘
```

## Security Mechanisms

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                          RNBS-Coin Security Layers                        │
│                                                                           │
├────────────┬────────────┬────────────┬────────────┬────────────┬──────────┤
│            │            │            │            │            │          │
│ Reputation │  Witness   │   Bloom    │ Signature  │   Coin     │ Wallet   │
│   System   │   Quorum   │  Filters   │Verification│ Integrity  │ Banning  │
│            │            │            │            │            │          │
└────────────┴────────────┴────────────┴────────────┴────────────┴──────────┘
``` 
