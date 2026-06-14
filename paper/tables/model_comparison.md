| model | n | base_rate | auroc | auprc | brier | log_loss | ece | cal_slope | cal_intercept |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Climatology | 8204 | 0.025 | 0.692 | 0.046 | 0.027 | 0.136 | 0.053 | 1.038 | -1.145 |
| Logistic (unweighted) | 8204 | 0.025 | 0.921 | 0.452 | 0.023 | 0.099 | 0.046 | 1.210 | -1.180 |
| Logistic (balanced) | 8204 | 0.025 | 0.925 | 0.420 | 0.142 | 0.448 | 0.271 | 1.009 | -4.050 |
| Logistic (balanced) + calibration | 8204 | 0.025 | 0.924 | 0.414 | 0.030 | 0.118 | 0.064 | 1.255 | -1.501 |
