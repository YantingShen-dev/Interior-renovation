"""Synthetic 5 x 3 m wall for local UI tests; not a measurement of the user's room."""
from pathlib import Path
import cv2
import numpy as np
output = Path(__file__).resolve().parents[1] / '.cache/video-room-fixture.webm'
output.parent.mkdir(exist_ok=True)
writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*'VP80'), 15, (640, 420))
if not writer.isOpened():
    raise RuntimeError('Cannot create the local test video')
try:
    for index in range(45):
        frame = np.full((420, 640, 3), 248, dtype=np.uint8)
        cv2.rectangle(frame, (70, 60), (570, 360), (220, 230, 240), -1)
        cv2.rectangle(frame, (170, 150), (270, 360), (80, 120, 170), -1)
        cv2.rectangle(frame, (370, 120), (490, 240), (220, 170, 70), -1)
        for p, label in [((70, 360), 'A'), ((570, 360), 'B'), ((570, 60), 'C'), ((70, 60), 'D')]:
            cv2.circle(frame, p, 5, (180, 60, 0), -1)
            cv2.putText(frame, label, (p[0]-8,p[1]-10), cv2.FONT_HERSHEY_SIMPLEX, .6, (100, 40, 0), 2)
        cv2.putText(frame, 'TEST ONLY: wall 5m x 3m', (160, 30), cv2.FONT_HERSHEY_SIMPLEX, .6, (100, 40, 0), 1)
        cv2.putText(frame, f'Frame {index}', (260, 400), cv2.FONT_HERSHEY_SIMPLEX, .5, (100, 40, 0), 1)
        writer.write(frame)
finally:
    writer.release()
print(output)
