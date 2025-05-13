export function getGesture(landmarks) {
    const GE = new fp.GestureEstimator([
      fp.Gestures.ThumbsUpGesture,
      fp.Gestures.VictoryGesture
    ]);
  
    const prediction = GE.estimate(landmarks, 7.0);
  
    if (prediction.gestures && prediction.gestures.length > 0) {
      const result = prediction.gestures.reduce((p, c) => (p.score > c.score) ? p : c);
      return result.name; 
    }
    
    return null;
}
  