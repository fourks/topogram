import { Session } from 'meteor/session'
import { Meteor } from 'meteor/meteor'
import { FlowRouter } from 'meteor/kadira:flow-router'

import d3 from 'd3'
import { $ }  from 'meteor/jquery'
import cytoscape  from 'cytoscape'

// cytoscape extensions
import edgehandles from 'cytoscape-edgehandles'
import cxtmenu from 'cytoscape-cxtmenu'
import spread from "cytoscape-spread"

import * as _ from 'lodash'

import { Nodes, Edges } from '../../../api/collections.js'
import { makeNode } from '../../../api/modelsHelpers.js'
import { colors } from '../../helpers/colors.js'

// register extensions
edgehandles( cytoscape, $ )
cxtmenu( cytoscape, $ ) // register extension

// register layouts
// TODO: currently Cola requires  a build from Grunt...
// import cycola from "cytoscape-cola"
// import cola from 'webcola'
// cycola(cytoscape, webcola)
spread(cytoscape)

/*
*
* @param domElement DOM the dom element where the graph will be created
* @param nodes Array array of Nodes
* @param edges Array array of Edges
* @param options Object a set of options
* @param readOnlyMode booelan toggle edit mode
*/
export const initGraph = function(domElement, nodes, edges, _options, readOnlyMode) {

  var options =_options || {}
  if (! _options ) _options = {}
  options.style = _options.style || applyDefaultStyle()
  options.mouse = _options.mouse || true
  options.cxtMenu = _options.cxtMenu || true
  options.edgehandles = _options.edgehandles || true

  // console.log("init network")
  console.log("nodes", nodes.length)
  console.log("edges", edges.length)
  console.log("readOnlyMode", readOnlyMode)

  var ghosts = getGhostNodes(nodes, edges)
  var elements = nodes.concat(edges, ghosts)
  var graph = cytoscape({
    container: domElement,
    hideLabelsOnViewport: true,
    ready: function() {
      // console.log('topogram ready')
    },
    layout: {
        name: 'preset' // load saved positions
    },
    elements : elements,
    style : options.style
  })

  // if (options.style) applyDefaultStyle(graph)
  if (options.mouse) mouseActions(graph)
  if (options.cxtMenu) initActions(graph, readOnlyMode)
  if (options.edgehandles) startEdgehandles(graph)

  addBehaviors(graph, readOnlyMode)
  updateRadiusByDegree(graph) // default is by degree
  console.log(graph)
  graph.reset()  // render layout

  return graph
}


export const initActions = function(graph, readOnlyMode) {

  var advancedEditMode = Session.get("advancedEditMode")
  console.log("init actions with advancedEditMode = "+ advancedEditMode)

  // drag node
  graph.off('free', 'node')  // reset
  graph.on('free', 'node', function(e) {
      var node = e.cyTarget

      // update position
      if (node.data("group") != "ghosts")
        Meteor.call('updateNodePosition', node.id(), node.position())

      // Node Merger
      if(advancedEditMode) {
          // check for node merger
          console.log("check for node merger")
          Session.set("mergeSource", null)
          Session.set("mergeTargets", null)
          Session.set('edgeClicked', null)

          // hit test
          var bb = node.boundingbox()
          var targets = graph.nodes().filterFn(function(d){
              var isPos =
                d.position().x > bb.x1
                &&
                d.position().x < bb.x2
                &&
                d.position().y > bb.y1
                &&
                d.position().y < bb.y2
              var isSame = (d.id() == node.id())
              return isPos && !isSame
          })

          // console.log(node, targets)
          if (targets.length) {
              Session.set("mergeSource", node.id())
              Session.set("mergeTargets", targets.map(function(d){return d.id()}))
              $('#modal-merge').openModal()
          }
      }
  })

  // edge creation: disabled by default
  if (!advancedEditMode || readOnlyMode) graph.edgehandles("disable")
  else graph.edgehandles("enable")

  // context menu (right click)

  if(!readOnlyMode) {
    var commands =  [{
        content: '<span><i class="small material-icons">star_rate</i></span>',
        select: function() {
          Meteor.call('starNode', this.id())
          var starred = (this.data("starred")) ? false : true
          this.data("starred", starred)
        }
    // }, {
    //     content: '<span><i class="small material-icons">lock</i></span>',
    //     select: function() {
    //         // console.log( this.position() )
    //         Meteor.call('lockNode', this.id(), this.position())
    //     },
    },{
        content: '<span><i class="small material-icons">comment</i></span>',
        select: function() {
            graph.selectElement(this, "node")
            $("#commentBox").show()
        }

    },{
        content: '<span><i class="small material-icons">library_books</i></span>',
        select: function() {
          // TODO : share to social networks
          graph.selectElement(this, "node")
        }

    }]

    // add delete only on advanced mode
    if(advancedEditMode)
      commands.push({
        content: '<span><i class="small material-icons">delete</i></span>',
        select: function() {

            // remove the node plus all connected edges
            Meteor.call('deleteNodeAndConnectedEdges', this.id())

            // remove from graph
            graph.remove(this.neighborhood('edge'))
            graph.remove(this)
        }
    })

    // update ctx menu
    if (graph.cxtMenuAPI) graph.cxtMenuAPI.destroy()
    graph.cxtMenuAPI = graph.cxtmenu({
      selector: 'node',
      commands: commands
    })
  }
}

/**
* Apply a default stylesheet to the Graph
*
*/
export const applyDefaultStyle = function() {
    return cytoscape.stylesheet()
      .selector('node')
        .style({
          'font-size': 6,//graphState.fontSize,
          'text-valign': 'center',
          'text-halign': 'right',
          'color': 'gray',
          'text-max-width': 60,
          'text-wrap': 'wrap',
          'min-zoomed-font-size': 0.4,
          'border-color': '#D84315',
          'background-color' : function(e) {
            var color = "#CCC"  // default
            if (e.data("group")) color = colors(e.data("group"))
            else if (e.data("color")) color = e.data("color")
            return e.data('starred') ? 'yellow' : color
          },
          // 'text-opacity' : 0, // hide label by default
          'label': function(e) {
            return e.data("name") ? e.data("name").trunc(20) : ""
          }
        })
      // node with degree zero
      // .selector('node[[degree = 0]]')
      //   .style({
      //       'background-color': '#656565'
      //       // 'display' :"none"
      //   })
      .selector('node[group="ghosts"]')
      .style({
          'background-opacity': .5,
          'border-width': '3',
          'border-color': 'gray',
          'border-opacity': .6
          // 'display' :"none"
      })
      .selector('edge')
        .style({
          'background-color' : "#000",
          'target-arrow-shape': 'none', // default is undirected graph
          'width': function(e) {
            return e.data("weight") ? e.data("weight") : .5
          },
          'line-color' : '#AAAAAA',
          'opacity': .2,
          'font-size':8,
          'text-opacity' : 0, // hide label by default
          'label': function(e) {
            return e.data("group") ? e.data("group") : ""
          }
        })
      .selector('.edgehandles-hover')
        .style({
            'background-color': 'red'
        })
      .selector('.edgehandles-source')
      .selector('.edgehandles-target')
      .selector('.edgehandles-preview, .edgehandles-ghost-edge')
        .style({
            'line-color': 'red',
            'target-arrow-color': 'red',
            'source-arrow-color': 'red'
        })
}

export const mouseActions = function(graph) {

  // mouse select actions
  graph.on('tap', 'node', function(e) {
      var node = e.cyTarget
      graph.selectElement(node, "node")
  })

  // display edge info
  graph.on('tap', 'edge',function(e) {
    graph.selectElement(e.cyTarget, "edge")
  })

  graph.on('mouseover', 'edge', function(e) {

      e.cyTarget.style({
        'line-color': '#D84315',
        'opacity' : '1'
      })

      graph.elements()
        .difference( e.cyTarget )
        .difference(e.cyTarget.connectedNodes())
        .css({
          'opacity' : ".2"
        })

      graph.mouseOverEdges(e.cyTarget)

  })

  graph.on('mouseout', 'edge', function(e) {
    e.cyTarget.style({
      'line-color': 'gray',
      'opacity' : '.2'
    })

    graph.nodes().css({
      'opacity' : "1"
    })


    // hide infobox only if no node is selected
    if (Session.get('currentId') != null && Session.get('currentType') != "node") {
      Session.set('currentId', null)
      Session.set('currentType', null)
    }

    if ( Session.get('prevNode') ) {
      Session.set('currentId', Session.get('prevNode'))
      Session.set('currentType', 'node')
    } else if ( Session.get('edgeClicked') ) {
      Session.set('currentId', Session.get('edgeClicked'))
      Session.set('currentType', 'edge')
    } else {
      $("#infoBox").hide()
    }

  })

  graph.on('mouseover', 'node', function(e) {

    e.cyTarget.style({
        'border-width': 2,
        'font-size' : 8,
        'color' : 'black',
        'label': function(d) {
          return d.data("name") ? d.data("name") : ""
        },
        'z-index': 300000
    })

    let edges = e.cyTarget.connectedEdges()
    edges.css({
      'line-color' : function(d) {
          return d.style('line-color') == "#D84315" ? "#AAAAAA" : "#D84315"
        },
        'opacity' : "1"
    })

    graph.edges().difference( edges ).css({
      'opacity' : ".2"
    })

  })

  graph.on('mouseout', 'node', function(e) {

      e.cyTarget.style({
        'border-width': function(d) {
          return (d.data("group") == "ghosts") ? 3 : 0
        },
        'font-size' : 6,
        'color' : 'gray',
        'label': function(d) {
          return d.data("name") ? d.data("name").trunc(20) : ""
        }
      })

      e.cyTarget.connectedEdges().css({
        'line-color' : function() {
            return "#AAAAAA"
          }
      })

      // reset opacity
      graph.edges().css({ 'opacity' : ".7" })
  })
}


export const setEdgeHandles = function(graph, state) {
    (state) ? graph.edgehandles("enable") : graph.edgehandles("disable")
}

export const startEdgehandles = function( graph ) {
  graph.edgehandles({
    complete: function(source, target) {
      var topogramId = FlowRouter.getParam('topogramId')
      Meteor.call('addEdgeFromIds', topogramId, source.data('id'), target.data('id'))
    }
  })
}

/**
* Remove singletons from Graph
*
*/
export const removeSingletons = function(graph) {
  graph.elements('node[[degree = 0]]').remove()
}


/*
* Add a bunch of edges and nodes to the graph
*/

export const getGhostNodes = function(nodes, edges) {

  //make sure all nodes referenced in edges actually exists
  var nodeIds = nodes.map(function(n){return n.data.id})

  // Add ghost nodes for non-existing nodes
  var ghostsIds = []
  edges.forEach(function(e){
    if (nodeIds.indexOf(e.data.source) == -1)
      ghostsIds.push(e.data.source)
    if (nodeIds.indexOf(e.data.target) == -1)
      ghostsIds.push(e.data.target)
  })

  var ghosts = _.uniq(ghostsIds).map(function(id){
    return createGhostNode(id)
  })
  console.log(ghosts.length, "ghost nodes", ghosts)

  return ghosts

}

const createGhostNode = function(id) {
  return makeNode( undefined,
    {
      'id' : id,
      'group' : 'ghosts'
    }
  )
}

export const createNode = function(id){
  // get x, y
  var x = $("#network").width()/2,
      y = $("#network").height()/2

  var topogramId = FlowRouter.getParam('topogramId')
  var n = makeNode(topogramId, { x:x, y:y, name: id }, {}, Meteor.userId())
  console.log("new node",n)
  Meteor.call("addNode", n)
}

export const resetFilters = function(graph) {

  graph.deselectAll()

  $(".network-search input").val("")

  graph.elements().deselect()
  graph.elements().show()

  // reset categories
  $(".filterByCategory").find("option:selected").removeAttr("selected")
  $('.filterByCategory select').material_select('destroy')
  $('.filterByCategory select').material_select()

  Session.set("selectedCategories", null)

  // reset time
  var startEndRange = []
  self.data.network.get().nodes().forEach( function (d){
    if(d.data().start) startEndRange.push(d.data().start);
    if(d.data().end) startEndRange.push(d.data().end);
  } )

  var min = (startEndRange.length) ? Math.min.apply(Math, startEndRange) : 0
  var max = (startEndRange.length) ? Math.max.apply(Math, startEndRange) : 100
  $("#filterByTime")[0].noUiSlider.set([min, max])
  Session.set("minMaxTime", [min, max])

  // update slider min / max
  let minDeg = graph.nodes().minDegree()
  let maxDeg = graph.nodes().maxDegree()
  $("#filterByDegree")[0].noUiSlider.set([minDeg,maxDeg])
  Session.set("minMaxDegree",[minDeg, maxDeg])

}

// TODO : refactor this function properly
export const addBehaviors = function(graph, readOnlyMode) {

  graph.selectElement = function(el, type){

    if(el.data("group") != "ghosts") {
      Session.set('currentType', type)
      Session.set('currentId', el.data("_id"))

      var url = graph.getElementUrl(el, type)
      FlowRouter.go(url)

      if( type == "node") {
        Session.set('prevNode', el.data('_id'))
        graph.focusOnNodes(el)
      }
      else if ( type == "edge") {
        Session.set('prevNode', null)
        Session.set('edgeClicked', el.data('_id'))
        graph.focusOnEdges(el)

      }

      $('#infoBox').show()
    }
  }

  graph.deselectAll = function(){
    Session.set('currentType', null)
    Session.set('currentId', null)
    Session.set('pathTargetNodeId', null)
    Session.set('prevNode', null)

    graph.unFocus()
    $('#infoBox').hide()
    $('#commentBox').hide()
    FlowRouter.go(window.location.pathname)
    window.location.hash=""
  }

  graph.getElementUrl = function(el, type) {
    // get node/edge _id
    var element;
    if(type =="node") {
      element = Nodes.findOne(el.data("_id"))
    } else if (type == "edge") {
      element = Edges.findOne(el.data("_id"))
    }
    return window.location.pathname + "#"+type+"-"+element._id
  }

  graph.getElById = function(id, type){
    if(type == "node") {
      return graph.nodes().filter("[_id='"+id+"']")
    } else if (type == "edge") {
      return graph.edges().filter("[_id='"+id+"']")
    }
  }

  graph.drawPath = function( sourceNode, targetNode ) {
    console.log(graph, sourceNode, targetNode)
    graph.unFocus()
    var path = graph.elements().dijkstra(sourceNode).pathTo(targetNode)

    // graph.focusOnNodes(path)
    graph.nodes().style({ 'opacity': '.1' })
    graph.edges().style({ 'opacity': '.1' })
    path.style({ 'opacity': '1' })

    // make only the focus selectable
    graph.nodes().unselectify()
    graph.edges().unselectify(false)
    path.selectify()
  }

  // select / unselect nodes
  graph.focusOnNodes = function(selectedNodes){

    // select
    var subGraph = selectedNodes.closedNeighborhood()

    // make only the focus selectable
    graph.nodes().hide()
    graph.edges().hide()
    subGraph.show()

    // store actual position
    subGraph.nodes().forEach(function(d){
      var prevPos = Object({"x":d.position().x, "y":d.position().y})
      d.data("prevPos", prevPos)
    })

    // apply focus layout
    subGraph.layout({"name":"concentric"})
  }

  graph.focusOnEdges = function(selectedEdges) {

    // show only selected
    let subGraph = selectedEdges.add(selectedEdges.connectedNodes())
    graph.nodes().hide()
    graph.edges().hide()
    subGraph.show()
  }

  graph.unFocus = function(){

    // remove layout focus and re-apply previous positions
    graph.nodes().forEach(function(d){
      if( d.data("prevPos") ) {
        d.position(d.data("prevPos"))
        delete d.removeData("prevPos")
      }
    })
    graph.layout({"name":"preset"})
    // shopw everything
    graph.nodes().show()
    graph.edges().show()

    Session.set("")
  }

  graph.mouseOverEdges = function(el) {
    if(el.data("group") != "ghosts") {
      Session.set('currentType', "edge")
      Session.set('currentId', el.data("_id"))
      // graph.focusOnEdges(el)
      $('#infoBox').show()
    }
  }

  graph.mouseOutEdges = function() {
    $('#infoBox').hide()
  }

  // show / hide elements
  graph.filterElements = function() {

    let deg = Session.get("minMaxDegree"),
      time = Session.get("minMaxTime"),
      categories = Session.get("selectedCategories")

    let minDegree=deg[0],
        maxDegree=deg[1],
        start=time[0],
        end=time[1],
        years = d3.range(start, end)


    var els = graph.nodes().filterFn(function( d ){

      // check time
      let nodeYears = d3.range(d.data('start'),d.data('end'))
      let intersect = nodeYears.filter(function(n) {
          return years.indexOf(n) != -1;
      });
      let inYearsRange = intersect.length ? true : false

      // check categories
      let inCategories = categories ? categories.indexOf(d.data("group")) > -1 : true

      // check degree
      let inDegreeRange =  (d.degree() >= minDegree && d.degree() <= maxDegree)

      return inYearsRange && inCategories && inDegreeRange
    });

    console.log(els.length);
    graph.elements().hide()
    els.select()
    els.show()
    els.nodes().connectedEdges().show()  // show edge context

  }

  // load node if hash
  if(window.location.hash) {
    var type = window.location.hash.split("-")[0].replace("#","")
    var elementId = window.location.hash.split("-")[1]
    var element
    if(type =="node") {
      element = Nodes.findOne({"_id" : elementId})
    } else if (type == "edge") {
      element = Edges.findOne({"_id" : elementId})
    }
    var el = graph.getElById(element._id, type)
    if(el) graph.selectElement(el, type)
  }

  // mode view-only
  if(readOnlyMode) {
    graph.autolock(true)  // prevent drag
    graph.edgehandles("disable")
  }

}

export const updateRadiusByWeight = function(graph) {
  var weights = graph.nodes().map( function (d){ return d.data("weight") })
  var min = Math.min.apply(Math, weights)
  var max = Math.max.apply(Math, weights)

  // calculate radius range
  var degreeDomain = d3.scale.linear().domain([
    min,
    max
  ]).range([6,40])

  // apply size
  graph.style()
    .selector('node')
    .style({
      'width': function(e) {
        return degreeDomain(e.data("weight"))
      },
      'height': function(e) {
        return degreeDomain(e.data("weight"))
      }
    }).update()
}

export const updateRadiusByDegree = function(graph ) {
  // calculate radius range
  var degreeDomain = d3.scale.linear().domain([
    graph.nodes().minDegree(),
    graph.nodes().maxDegree()
  ]).range([6,40])

  // apply size
  graph.style()
    .selector('node')
    .style({
      'width': function(e) {
        return degreeDomain(e.degree())
      },
      'height': function(e) {
        return degreeDomain(e.degree())
      }
    }).update()
}
