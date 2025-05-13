export function isThumbsUp(landmarks) {
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];
  
    return thumbTip.y < indexMCP.y && thumbTip.y < middleMCP.y;
  }
  