window.BENCHMARK_DATA = {
  "lastUpdate": 1704457807933,
  "repoUrl": "https://github.com/TREEcg/extract-cbd-shape",
  "entries": {
    "Extraction algorithm Benchmark for inband data": [
      {
        "commit": {
          "author": {
            "email": "xueying_deng@outlook.com",
            "name": "XD",
            "username": "xdxxxdx"
          },
          "committer": {
            "email": "xueying_deng@outlook.com",
            "name": "XD",
            "username": "xdxxxdx"
          },
          "distinct": true,
          "id": "ff22863fa0279ea005ce7fc2a0d7f32921d5e113",
          "message": "feat: add Github action for inband performance",
          "timestamp": "2024-01-05T13:15:01+01:00",
          "tree_id": "d4d29ba3ec9da4a98b5a329ebcc9e6e67bba5914",
          "url": "https://github.com/TREEcg/extract-cbd-shape/commit/ff22863fa0279ea005ce7fc2a0d7f32921d5e113"
        },
        "date": 1704457807488,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "CBDAndBlankNode",
            "value": 55965,
            "range": "±3.81%",
            "unit": "ops/sec",
            "extra": "129 samples"
          },
          {
            "name": "CBDAndNamedGraphs",
            "value": 61864,
            "range": "±1.80%",
            "unit": "ops/sec",
            "extra": "131 samples"
          },
          {
            "name": "CBDAndSimpleShape",
            "value": 55703,
            "range": "±3.35%",
            "unit": "ops/sec",
            "extra": "129 samples"
          },
          {
            "name": "CBDAndSimpleShapeAndNamedGraphs",
            "value": 56509,
            "range": "±1.68%",
            "unit": "ops/sec",
            "extra": "131 samples"
          },
          {
            "name": "CBDAndShaclExtended",
            "value": 46299,
            "range": "±2.57%",
            "unit": "ops/sec",
            "extra": "133 samples"
          },
          {
            "name": "CBDAndShaclExtendedComplex",
            "value": 43383,
            "range": "±3.23%",
            "unit": "ops/sec",
            "extra": "132 samples"
          }
        ]
      }
    ]
  }
}