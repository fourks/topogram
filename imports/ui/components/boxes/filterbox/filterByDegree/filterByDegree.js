import './filterByDegree.html'
import { Template } from 'meteor/templating'
import { Session } from 'meteor/session';

import { $ } from 'meteor/jquery'
import noUiSlider from "nouislider"
import wNumb from 'wnumb'

import { Edges } from '../../../../../api/collections.js'

Template.filterByDegree.helpers({
    hasEdgesWeight: function() {
        var edge = Edges.findOne()
        if (!edge) return false
        else return edge.data.count ? true : false
    },
    maxMinSlider: function() {
      return Session.get("minMaxDegree")
    }
})

Template.filterByDegree.rendered = function() {

  var self = this

  // TODO : get scale
  var min = 0
  var max = 50

  Session.set("minMaxDegree", [min, max])

  // create slider

  noUiSlider.create($("#filterByDegree")[0], {
      start: [min, max],
      connect: true,
      range: {
          'min': min,
          'max': max
      },
      format: {
          from: function(value) {
              return ~~value;
          },
          to: function(value) {
              return ~~value;
          }
      },
      step: 1
  })


  $("#filterByDegree")[0].noUiSlider.on('change', function(val) {
    var net = self.data.network.get()

    // recalculate scale
    var deg = net.nodes().map(function(d){ return d.degree() })
    min = Math.max.apply(Math, deg)
    max = Math.min.apply(Math, deg)
    // console.log(slider)
    // slider.updateOptions({
    //     range: {
    //         'min': min,
    //         'max': max
    //     }
    // })

    Session.set("minMaxDegree", val)

    var filter = "node[[degree>="+val[0]+"]][[degree<="+val[1]+"]]"
    net.filterGraph(filter)
  })

}
