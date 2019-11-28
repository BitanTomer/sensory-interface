// initialize Audio context on page load.
let AudioContextClass = (<any>window).webkitAudioContext || window.AudioContext;
let audioContext = new AudioContextClass();
let oscillator = null;
let source = null;
// This variable stores the current cell under touch point in case touch is available.
// In case touch is not available, it stores the current focused cell.
let selectedCell = null;
let timeOut = null;
let data: number[][] = null;

function brailleControllerPositionChangeListener(event) {
  console.log('brailleControllerPositionChangeListener: cursorPosition=' + event.cursorPosition + ' cursorPosition=' + event.character);
}

function processData() {
  brailleController = new BrailleController(document.getElementById('container'));
  brailleController.setPositionChangeListener(brailleControllerPositionChangeListener);
  data = getDataFromUrl();
  createGrid();
  addOnClickAndOnTouchSoundToGrid();
  addNavigationToGrid();
}

function createGrid() {
  let grid = $(document.createElement('div'));
  grid.prop('role', 'grid');
  grid.prop('id', 'grid');
  grid.prop('aria-readonly', 'true');
  grid.width('100%');
  grid.height('70%');
  grid.prop('className', 'table');
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    let gridRow = $(document.createElement('div'));
    gridRow.prop('role', 'row');
    gridRow.prop('className', 'row');
    for (let columnIndex = 0; columnIndex < data[0].length; columnIndex++) {
      let gridCell = $(document.createElement('div'));
      gridCell.attr('role', 'gridcell');
      gridCell.prop('className', 'cell');
      gridCell.append(document.createTextNode(data[rowIndex][columnIndex].toString()));
      gridCell.prop('aria-readonly', 'true');
      gridCell.prop('row', rowIndex);
      gridCell.prop('col', columnIndex);
      gridRow.append(gridCell);
    }
    grid.append(gridRow);
  }
  let container = $('#container');
  container.append(grid);
}

function addOnClickAndOnTouchSoundToGrid() {
  $('div[role="gridcell"]').each(function(index, element) {
    $(element).click(startSoundPlayback);
    $(element).on('touchstart', startSoundPlayback);
    $(element).on('touchmove', onCellChange);
    $(element).on('touchleave', stopSoundPlayback);
    $(element).on('touchcancel', stopSoundPlayback);
    $(element).focus(startSoundPlayback);
  });
}

function addNavigationToGrid() {
  $('div[role="gridcell"]').each(function(index, gridCell) {
    if (index == 0) {
      $(gridCell).prop('tabindex', '0');
    } else {
      $(gridCell).prop('tabindex', '-1');
    }
    $(gridCell).keydown(navigateGrid);
  });
}

function navigateGrid(event) {
  const keyName = event.key;
  let currentCell = event.currentTarget;
  let newFocusedCell = null;
  switch (keyName) {
    case 'ArrowDown':
      if (currentCell.parentNode.nextSibling != null) {
        let index = currentCell.getAttribute('col');
        newFocusedCell = currentCell.parentNode.nextSibling.childNodes[index];
      }
      break;
    case 'ArrowUp':
      if (currentCell.parentNode.previousSibling != null) {
        let index = currentCell.getAttribute('col');
        newFocusedCell = currentCell.parentNode.previousSibling.childNodes[index];
      }
      break;
    case 'ArrowLeft':
      newFocusedCell = currentCell.previousSibling;
      break;
    case 'ArrowRight':
      newFocusedCell = currentCell.nextSibling;
      break;
    case 'Home':
      newFocusedCell = currentCell.parentNode.firstChild;
      break;
    case 'End':
      newFocusedCell = currentCell.parentNode.lastChild;
      break;
    // TODO: add PageUp/Down keys
    default:
      return;
  }
  if (newFocusedCell != null) {
    newFocusedCell.focus();
  }
}

/**
* Maps each cell's row and col to a 2D coordinate. 
* Returns a map with the x and y coordinates (e.g {x:1, y:0}).
* Examples:
* Cells in a 3X3 grid will be positioned between -1 and 1 in both x and y.
* Cells in a 2X2 grid will be positioned between -1.5 and 1.5 in both x and y.
*/
function get2DCoordinates(rowNumber, columnNumber) {
  let columnCount = data[0].length;
  // The col attribute is zero based indexe
  // For example, the value of  col attribute for a cell found in the third column is 2
  let xCoordinate = columnNumber - Math.floor(columnCount / 2);
  // Align xCoordinate to be symmetric with respect to y-axis
  if (columnCount % 2 == 0) {
    xCoordinate += 0.5;
  }
  let rowCount = data.length;
  // The same applies for row attribute as col one
  let yCoordinate = rowNumber - Math.floor(rowCount / 2);
  // Align yCoordinate similar to xCoordinate:
  if (rowCount % 2 == 0) {
    yCoordinate += 0.5;
  }
  // Negate yCoordinate so upper cells have positive values, 
  // and lower cells have negative values
  yCoordinate = -yCoordinate;
  return {
    x: xCoordinate,
    y: yCoordinate,
  }
}

/** Calculates the maximum Euclidean distance, in 2D, of a cell in the grid. */
function getCellMaxDistance() {
  let maxCoords = get2DCoordinates(data.length, data[0].length);
  // Calculate Euclidean distance of cell from origin (0,0)
  return Math.sqrt(Math.pow(maxCoords.x, 2) + Math.pow(maxCoords.y, 2));
}

function createAndSetPanner(currentCell) {
  let panner = audioContext.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'linear';
  panner.refDistance = 0;
  panner.rolloffFactor = panner.maxDistance / (getCellMaxDistance() * 2);
  let coordinates = get2DCoordinates(
    currentCell.getAttribute('row'), currentCell.getAttribute('col'));
  panner.setPosition(coordinates.x, coordinates.y, 0);
  return panner;
}

function createAndSetOscillator(currentCell) {
  oscillator = audioContext.createOscillator();
  let selectedValue = currentCell.firstChild.data;
  const MAX_FREQUENCY = 1000;
  const MIN_FREQUENCY = 100;
  let minValue = parseFloat(getUrlParam('minValue'));
  let maxValue = parseFloat(getUrlParam('maxValue'));
  selectedValue = parseFloat(selectedValue);
  if (selectedValue < minValue) {
    selectedValue = minValue;
  }
  if (selectedValue > maxValue) {
    selectedValue = maxValue;
  }
  let frequency = MIN_FREQUENCY + (selectedValue - minValue) / (maxValue - minValue) * (MAX_FREQUENCY - MIN_FREQUENCY);
  oscillator.frequency.value = frequency;
  oscillator.channelCount = 1;
}

function startSoundPlayback(event) {
  selectedCell = event.currentTarget;
  event.preventDefault();
  stopSoundPlayback(event);
  playSound(event);
}

function playSound(event) {
  if (audioContext.state == 'suspended') {
    audioContext.resume();
  }
  if (getUrlParam('instrumentType') == 'synthesizer') {
    playSoundWithOscillator();
  } else {
    playSoundFromAudioFile();
  }
}

function playSoundWithOscillator() {
  // Create oscillator and panner nodes and connect them each time we want to play audio
  // because those nodes are singel use entities
  createAndSetOscillator(selectedCell);
  let panner = createAndSetPanner(selectedCell);
  oscillator.connect(panner);
  panner.connect(audioContext.destination);
  oscillator.start(audioContext.currentTime);
  timeOut = setTimeout(() => {
    stopSoundPlayback(event);
  }, 1000);
}

function playSoundFromAudioFile() {
  let fileName = getFileToPlay(selectedCell);
  let request = new XMLHttpRequest();
  request.open('get', fileName, true);
  request.responseType = 'arraybuffer';
  request.onload = function () {
    let data = request.response;
    audioContext.decodeAudioData(data, playAudioFile);
  };
  request.send();
}

function playAudioFile(buffer) {
  source = audioContext.createBufferSource();
  source.buffer = buffer;
  let panner = createAndSetPanner(selectedCell);
  source.connect(panner);
  panner.connect(audioContext.destination);
  source.start(audioContext.currentTime);
}

function getFileToPlay(currentCell) {
  let minValue = parseFloat(getUrlParam('minValue'));
  let maxValue = parseFloat(getUrlParam('maxValue'));
  let selectedValue = currentCell.firstChild.data;
  selectedValue = parseFloat(selectedValue);
  const NUMBER_OF_TRACKS = 22;
  let trackNumber = (selectedValue - minValue) / (maxValue - minValue) * NUMBER_OF_TRACKS;
  trackNumber = Math.ceil(trackNumber);
  if (trackNumber == 0) {
    trackNumber++;
  }
  let instrumentType = getUrlParam('instrumentType');
  let fileName = '/assets/' + instrumentType;
  fileName += '/track' + trackNumber + '.mp3';
  return fileName;
}

function stopSoundPlayback(event) {
  try {
    if (oscillator != null) {
      oscillator.stop(audioContext.currentTime);
    }
    if (source != null) {
      source.stop(audioContext.currentTime);
    }
    if (timeOut != null) {
      window.clearTimeout(timeOut);
    }
    if (event != undefined) {
      event.preventDefault();
    }
  } catch (e) {
    console.log(e);
  }
}

function onCellChange(event) {
  // Get the first changed touch point. We surely have one because we are listening to touchmove event, and surely a touch point have changed since the last event.
  let changedTouch = event.changedTouches[0];
  let elementUnderTouch = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);
  if (elementUnderTouch == selectedCell) {
    return;
  }
  if (elementUnderTouch == null || elementUnderTouch.getAttribute('role') != 'gridcell') {
    return;
  }
  selectedCell = elementUnderTouch;
  stopSoundPlayback(event);
  playSound(event);
  event.stopPropagation();
}

function getUrlParam(variableName) {
  let url = new URL(window.location.href);
  let params = url.searchParams;
  if (params.has(variableName) == false) {
    return '';
  }
  return params.get(variableName);
}

function getDataFromUrl() {
  let result: number[][] = Array();
  const dataString: string = getUrlParam('data');
  let lines = dataString.split('\n');
  let line;
  let rowIndex = 0;
  for (line of lines) {
    result[rowIndex] = Array();
    let columnIndex = 0;
    let values = line.split('\t');
    let value;
    for (value of values) {
      result[rowIndex][columnIndex] = value;
      columnIndex++;
    }
    rowIndex++;
  }
  return result;
}
