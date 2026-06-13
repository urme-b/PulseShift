| model | n | base_rate | auroc | auprc | brier | log_loss | ece | cal_slope | cal_intercept |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Climatology | 8491 | 0.049 | 0.660 | 0.082 | 0.047 | 0.201 | 0.028 | 0.441 | -1.800 |
| Logistic (unweighted) | 8491 | 0.049 | 0.891 | 0.426 | 0.037 | 0.139 | 0.022 | 1.067 | -0.390 |
| Logistic (balanced) | 8491 | 0.049 | 0.893 | 0.400 | 0.136 | 0.430 | 0.249 | 0.903 | -2.955 |
| Logistic (balanced) + calibration | 8491 | 0.049 | 0.893 | 0.395 | 0.041 | 0.150 | 0.040 | 1.033 | -0.784 |
