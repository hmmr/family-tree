/**
   Family Tree visualizer.

   Author: Aleksey Morarash <aleksey.morarash@gmail.com>
   Copyright: 2016, Aleksey Morarash
   License: BSD
 */

"use strict";

// ----------------------------------------------------------------------
// constants

var defaultLanguage = "en"

var defaultUseIcons = true

var textOnlyPersonWidth = 200
var textOnlyPersonHeight = 20
var imagedPersonWidth = 260
var imagedPersonHeight = 50
var childPad = 20
var siblingPad = 5
var svgPad = 3
var partnerShift = 10

var iconWidth = 30
var iconHeight = 40

var debug = false

// ----------------------------------------------------------------------
// runtime vars

var useIcons = defaultUseIcons

var currentLanguage = defaultLanguage
var currentPerson = null

var personWidth = textOnlyPersonWidth
var personHeight = textOnlyPersonHeight

var families = {}
var persons = {}

/*
 ----------------------------------------------------------------------
  Data Model
 ----------------------------------------------------------------------
*/

function storePerson(person) {
    if (person.id == null || persons[person.id] != null) return
    person.childOf = canonicalizeMemberOf(person.childOf)
    person.parentOf = canonicalizeMemberOf(person.parentOf)
    persons[person.id] = person
    for (var i = 0; i < person.childOf.length; i++)
        getFamily(person.childOf[i]).children.push(person.id)
    for (var i = 0; i < person.parentOf.length; i++)
        getFamily(person.parentOf[i]).parents.push(person.id)
}

// ----------------------------------------------------------------------
// Getters

function getFamily(familyId) {
    if (families[familyId] == null)
        families[familyId] = {
            "id": familyId,
            "parents": [],
            "children": []}
    return families[familyId]
}

function getLongName(personId) {
    var person = persons[personId]
    var fullname = person["fullname"]
    if (fullname != null && 0 < fullname.length) return fullname
    return person["name"]
}

function getChildren(personId) {
    var person = persons[personId]
    var children = []
    for (var i = 0; i < person.parentOf.length; i++)
        children = children.concat(getFamily(person.parentOf[i]).children)
    return children
}

function sortByBirthDate(personIds) {
    personIds = personIds.sort(function (a, b) {
        a = persons[a].bdate
        b = persons[b].bdate
        if (a < b) return -1
        if (a > b) return 1
        return 0
    })
    return personIds
}

function getPartner(personId, familyId) {
    var family = families[familyId]
    for (var i = 0; i < family.parents.length; i++)
        if (family.parents[i] != personId) return family.parents[i]
    return null
}

function getBrothers(personId) {
    var parents = getParents(personId)
    var brothers = []
    for (var i = 0; i < parents.length; i++) {
        var children = getChildren(parents[i])
        for (var j = 0; j < children.length; j++)
            if (children[j] != personId) brothers.push(children[j])
    }
    return brothers
}

function getPartners(personId) {
    var person = persons[personId]
    var partners = []
    for (var i = 0; i < person.parentOf.length; i++) {
        var family = getFamily(person.parentOf[i])
        for (var j = 0; j < family.parents.length; j++)
            if (family.parents[j] != personId)
                partners.push(family.parents[j])
    }
    return partners
}

function getParents(personId) {
    var person = persons[personId]
    var parents = []
    for (var i = 0; i < person.childOf.length; i++)
        parents = parents.concat(getFamily(person.childOf[i]).parents)
    return parents
}

function getCousins(personId) {
    var uncles = getUncles(personId)
    var cousins = []
    for (var i = 0; i < uncles.length; i++)
        cousins = cousins.concat(getChildren(uncles[i]))
    return uniq(cousins)
}

function getUncles(personId) {
    var parents = getParents(personId)
    var grandParents = []
    for (var i = 0; i < parents.length; i++)
        grandParents = grandParents.concat(getParents(parents[i]))
    grandParents = uniq(grandParents)
    var uncles = []
    for (var i = 0; i < grandParents.length; i++){
        var children = getChildren(grandParents[i])
        for (var j = 0; j < children.length; j++)
            if (!isIn(children[j], parents)) uncles.push(children[j])
    }
    return uniq(uncles)
}

function getNephews(personId) {
    var brothers = getBrothers(personId)
    var nephews = []
    for (var i = 0; i < brothers.length; i++)
        nephews = nephews.concat(getChildren(brothers[i]))
    return uniq(nephews)
}

// Return copy of source list with all duplicate elements removed.
function uniq(list) {
    var res = []
    for (var i = 0; i < list.length; i++)
        if (!isIn(list[i], res)) res.push(list[i])
    return res
}

function isIn(elem, list){
    for(var i = 0; i < list.length; i++)
        if (elem == list[i]) return true
    return false
}

function canonicalizeMemberOf(obj) {
    if (Array.isArray(obj)) return obj
    if (obj == null) return []
    return [obj]
}

function getPersonIdFromHash() {
    var hash = window.location.hash
    if (hash && hash.startsWith('#')) {
        log(hash)
        hash = hash.slice(1)
        log(hash)
        var person = persons[hash]
        if (person != null) return person.id
    }
}

/*
 ----------------------------------------------------------------------
  Navigation
 ----------------------------------------------------------------------
*/

function onPersonClick(personId) {
    render(personId)
}

function setLang(lang) {
    currentLanguage = lang
    render(currentPerson)
}

function applyShowIcons() {
    var cb = document.getElementById("cbShowIcons")
    useIcons = cb.checked
    render(currentPerson)
}

/*
 ----------------------------------------------------------------------
  Dimensions calculation
 ----------------------------------------------------------------------
*/

// From person up to eldest ancestors.
function getParentsDimensions(personId) {
    var person = persons[personId]
    var dims = {x:0, y:0}
    for (var i = 0; i < person.childOf.length; i++) {
        if (getFamily(person.childOf[i]).parents.length == 0) continue
        var famDims = getParentsFamilyDimensions(person.childOf[i])
        if (0 < famDims.x && 0 < famDims.y) {
            dims.x = Math.max(dims.x, famDims.x + childPad)
            if (0 < dims.y) dims.y += siblingPad
            dims.y += famDims.y
        }
    }
    return dims
}

// From family up to eldest ancestors.
function getParentsFamilyDimensions(familyId) {
    var family = getFamily(familyId)
    var famDims = {x:0, y:0}
    if (family.parents.length == 0) return famDims
    var parBlockHeight = family.parents.length * personHeight
    for (var i = 0; i < family.parents.length; i++) {
        var grandDims = getParentsDimensions(family.parents[i])
        if (0 < famDims.y) famDims.y += siblingPad
        famDims = {
            x: Math.max(famDims.x, grandDims.x + personWidth),
            y: famDims.y + grandDims.y}
    }
    famDims.y = Math.max(famDims.y, parBlockHeight)
    return famDims
}

function getPersonDescendantsDimensions(personId) {
    var person = persons[personId]
    if (person.parentOf.length == 0) return {x:personWidth, y:personHeight}
    var dims = {x:0, y:0}
    for (var i = 0; i < person.parentOf.length; i++) {
        var famDims = getFamilyDescendantsDimensions(personId, person.parentOf[i])
        dims.x = Math.max(dims.x, famDims.x)
        if (0 < dims.y) dims.y += siblingPad
        dims.y += famDims.y
    }
    return dims
}

function getFamilyDescendantsDimensions(personId, familyId) {
    var famDims = {x: personWidth, y: personHeight}
    var partnerId = getPartner(personId, familyId)
    if (partnerId != null)
        famDims.y += personHeight
    var childrenDims = getChildrenDimensions(familyId)
    if (0 < childrenDims.x && 0 < childrenDims.y){
        famDims.x += childrenDims.x
        famDims.y = Math.max(famDims.y, childrenDims.y)
    }
    return famDims
}

function getParentOffset(personId, familyId) {
    var famDims = getFamilyDescendantsDimensions(personId, familyId)
    if (getPartner(personId, familyId) != null) {
        var childrenDims = getChildrenDimensions(familyId)
        if (childrenDims.y < famDims.y) return {x:0, y:0}
        if (childrenDims.y / 2 < 1.5 * personHeight)
            return {x:0, y:(childrenDims.y - 2 * personHeight) / 2}
    }
    return {x:0, y:(famDims.y - personHeight) / 2}
}

function getChildrenDimensions(familyId) {
    var family = getFamily(familyId)
    var dims = {x: 0, y: 0}
    if (0 < family.children.length) {
        dims.x += childPad
        var maxWidth = 0
        for (var i = 0; i < family.children.length; i++) {
            var child = family.children[i]
            if (0 < dims.y) dims.y += siblingPad
            var desDims = getPersonDescendantsDimensions(child)
            maxWidth = Math.max(maxWidth, desDims.x)
            dims.y += desDims.y
        }
        dims.x += maxWidth
    }
    return dims
}

function vAdd(v1, v2) {
    return {x: v1.x + v2.x, y: v1.y + v2.y}
}

/*
 ----------------------------------------------------------------------
  SVG Rendering
 ----------------------------------------------------------------------
*/

function render(personId) {
    hideContextMenu()
    localizeContextMenu()
    setupSettingsMenu()
    if (useIcons) {
        personWidth = imagedPersonWidth
        personHeight = imagedPersonHeight
    }else{
        personWidth = textOnlyPersonWidth
        personHeight = textOnlyPersonHeight
    }
    var ancDims = getParentsDimensions(personId)
    var desDims = getPersonDescendantsDimensions(personId)
    var svg = document.getElementById("cnv")
    svg.innerHTML = ''
    var width = ancDims.x + desDims.x + svgPad * 2
    var height = Math.max(ancDims.y, desDims.y) + svgPad * 2
    svg.setAttribute("width", width)
    svg.setAttribute("height", height)
    var ancBindPoint =
        renderPersonDescendants(
            personId,
            {x: svgPad + ancDims.x,
             y: svgPad + (height - desDims.y) / 2})
    renderPersonAncestors(
        personId,
        {x: svgPad, y: (height - svgPad * 2 - ancDims.y) / 2},
        ancBindPoint)
    currentPerson = personId
    window.location.hash = "#" + personId
}

function renderPersonAncestors(personId, offset, childBind) {
    var person = persons[personId]
    var ancDims = getParentsDimensions(person.id)
    if (debug) renderGroup(offset, ancDims, "lime")
    var famHOffset = 0
    for (var i = 0; i < person.childOf.length; i++) {
        var family = getFamily(person.childOf[i])
        if (family.parents.length == 0) continue
        var famDims = getParentsFamilyDimensions(family.id)
        var famOffset = vAdd(offset, {x: ancDims.x - famDims.x - childPad, y: famHOffset})
        renderPersonAncestorsFamily(family.id, famOffset, childBind)
        famHOffset += famDims.y + siblingPad
    }
}

function renderPersonAncestorsFamily(familyId, offset, childBind) {
    var family = getFamily(familyId)
    var ancDims = getParentsFamilyDimensions(family.id)
    if (debug) renderGroup(offset, ancDims, "pink")
    var grandHOffset = 0
    var parHOffset = 0
    var parents = family.parents.sort(function (a, b) {
        if (persons[a].gender == "m") return -1
        if (persons[b].gender == "m") return 1
        if (persons[a].gender == "f") return -1
        if (persons[b].gender == "f") return 1
        return 0
    })
    var parBlockHeight = parents.length * personHeight
    for (var j = 0; j < parents.length; j++) {
        var parent = persons[parents[j]]
        var parRectOffset = {
            x: offset.x + ancDims.x - personWidth,
            y: offset.y + ancDims.y / 2 - parBlockHeight / 2 + parHOffset}
        renderPersonRect(parent.id, parRectOffset)
        var grandDims = getParentsDimensions(parent.id)
        renderPersonAncestors(
            parent.id,
            {x: offset.x + ancDims.x - grandDims.x - personWidth, y: offset.y + grandHOffset},
            vAdd(parRectOffset, {x: 0, y: personHeight / 2}))
        grandHOffset += grandDims.y + siblingPad
        parHOffset += personHeight
    }
    if (childBind != null)
        renderLine(
            childBind.x, childBind.y,
            offset.x + ancDims.x, offset.y + ancDims.y / 2)
}

function renderPersonDescendants(personId, offset, parentBind) {
    var person = persons[personId]
    var isMainPerson = parentBind == null
    if (0 == person.parentOf.length) {
        if (parentBind != null)
            renderLine(
                parentBind.x, parentBind.y,
                offset.x, offset.y + personHeight / 2)
        renderPersonRect(personId, offset, {x: personWidth, y: personHeight}, isMainPerson)
        return {x: offset.x, y: offset.y + personHeight / 2}
    }
    if (debug) {
        var personDims = getPersonDescendantsDimensions(personId)
        renderGroup(offset, personDims, "lime")
    }
    var ancBindPoint = null
    var hoffset = 0
    var lastPersonRectHOffset = 0
    for (var i = 0; i < person.parentOf.length; i++) {
        var family = getFamily(person.parentOf[i])
        var partnerId = getPartner(personId, family.id)
        var children = getFamily(family.id).children
        var famDims = getFamilyDescendantsDimensions(personId, family.id)
        var famOffset = vAdd(offset, {x: 0, y: hoffset})
        if (debug) renderGroup(famOffset, famDims, "magenta")
        var parentOffset = getParentOffset(personId, family.id)
        var parentAbs = vAdd(famOffset, parentOffset)
        if (0 < i) {
            renderLine(
                offset.x + partnerShift / 2, lastPersonRectHOffset + personHeight,
                offset.x + partnerShift / 2, parentAbs.y)
        }
        if (i == 0 && parentBind != null)
            renderLine(
                parentBind.x, parentBind.y,
                parentAbs.x, parentAbs.y + personHeight / 2)
        renderPersonRect(personId, parentAbs, null, isMainPerson)
        if (ancBindPoint == null) {
            ancBindPoint = {x: parentAbs.x, y: parentAbs.y + personHeight / 2}
        }
        isMainPerson = false
        lastPersonRectHOffset = parentAbs.y
        if (partnerId != null) {
            renderPersonRect(
                partnerId,
                vAdd(vAdd(famOffset, parentOffset), {x: partnerShift, y: personHeight}),
                {x: personWidth - partnerShift, y: personHeight})
        }
        renderChildren(
            family.id,
            vAdd(famOffset, {x: personWidth + childPad, y: 0}),
            vAdd(parentAbs, {x: personWidth, y: personHeight / 2}))
        hoffset += famDims.y + siblingPad
    }
    return ancBindPoint
}

function renderChildren(familyId, offset, parentBind) {
    var family = getFamily(familyId)
    var chDims = getChildrenDimensions(familyId)
    var hoffset = 0
    if (debug) renderGroup(vAdd(offset, {x: -childPad, y: 0}), chDims)
    var children = sortByBirthDate(family.children)
    for (var i = 0; i < children.length; i++) {
        var childId = children[i]
        var childDims = getPersonDescendantsDimensions(childId)
        renderPersonDescendants(childId, vAdd(offset, {x: 0, y: hoffset}), parentBind)
        hoffset += childDims.y + siblingPad
    }
}

/*
 ----------------------------------------------------------------------
  Lowlevel rendering routines
 ----------------------------------------------------------------------
*/

var svgns = "http://www.w3.org/2000/svg"

function renderPersonRect(personId, offset, dims, isHighlighted) {
    var person = persons[personId]
    var svg = document.getElementById("cnv")
    var rect = document.createElementNS(svgns, "rect");
    if (dims == null) dims = {x: personWidth, y: personHeight}
    rect.setAttribute("x", offset.x);
    rect.setAttribute("y", offset.y);
    rect.setAttribute("rx", 5);
    rect.setAttribute("ry", 5);
    rect.setAttribute("width", dims.x);
    rect.setAttribute("height", dims.y);
    var strokeColor = "black"
    var strokeWidth = 1
    if (isHighlighted) {
        strokeColor = "navy"
        strokeWidth = 3
    }
    rect.setAttribute("stroke", strokeColor);
    rect.setAttribute("stroke-width", strokeWidth);
    rect.setAttribute("onclick", "onPersonClick('" + person.id + "')")
    rect.addEventListener("contextmenu", function(event) {
        showContextMenu(person.id, event)
    })
    if (person.gender == "m") {
        rect.setAttribute("fill", "#b8cee6")
    }else if (person.gender == "f"){
        rect.setAttribute("fill", "#feccf0")
    }else{
        rect.setAttribute("fill", "#f3dbb6")
    }
    // insert text element with person name
    var text = document.createElementNS(svgns, "text");
    text.innerHTML = person.name
    text.setAttribute("style", "cursor:default")
    text.setAttribute("onclick", "onPersonClick('" + person.id + "')")
    text.addEventListener("contextmenu", function(event) {
        showContextMenu(person.id, event)
    })
    svg.appendChild(rect)
    svg.appendChild(text)
    if (useIcons) {
        text.setAttribute("x", offset.x + iconWidth + 6);
    }else{
        text.setAttribute("x", offset.x + 3);
    }
    var textHeight = text.getBBox().height
    text.setAttribute("y", offset.y + textHeight - 3);
    // insert text element with person birth-death (only when icons are enabled)
    if (useIcons) {
        var birth = person.bdate
        var death = person.ddate
        if (birth || death) {
            var text = document.createElementNS(svgns, "text");
            if (birth != null && 0 < birth.length) {
                while (birth.endsWith('-00'))
                    birth = birth.slice(0, -3)
            }else{
                birth = '&hellip;'
            }
            if (death != null && 0 < death.length) {
                while (death.endsWith('-00'))
                    death = death.slice(0, -3)
            }else{
                death = ''
            }
            text.innerHTML = birth + '&mdash;' + death
            text.setAttribute("style", "cursor:default")
            text.setAttribute("onclick", "onPersonClick('" + person.id + "')")
            text.addEventListener("contextmenu", function(event) {
                showContextMenu(person.id, event)
            })
            text.setAttribute("x", offset.x + iconWidth + 6);
            text.setAttribute("y", offset.y + textHeight * 2);
            svg.appendChild(text)
        }
    }
    // insert person photo or icon
    if (useIcons) {
        var img = document.createElementNS(svgns, "image");
        img.setAttribute("x", offset.x + 5);
        img.setAttribute("y", offset.y + 5);
        img.setAttribute("width", iconWidth);
        img.setAttribute("height", iconHeight);
        img.setAttribute("style", "cursor:default")
        if (person.icon != null && 0 < person.icon.length) {
            img.setAttribute("href", person.icon)
        }else if (person.gender == "m") {
            img.setAttribute("href", "icons/male.png")
        }else if (person.gender == "f") {
            img.setAttribute("href", "icons/female.png")
        }else{
            img.setAttribute("href", "icons/unknown.png")
        }
        img.addEventListener("contextmenu", function(event) {
            showContextMenu(person.id, event)
        })
        img.setAttribute("title", "icon")
        svg.appendChild(img)
    }
}

function renderLine(x1, y1, x2, y2) {
    var svg = document.getElementById("cnv")
    var line = document.createElementNS(svgns, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("style", "stroke:black;stroke-width:1")
    svg.appendChild(line)
}

// Used for layout debugging.
function renderGroup(offset, dims, color) {
    var svg = document.getElementById("cnv")
    var rect = document.createElementNS(svgns, "rect")
    rect.setAttribute("x", offset.x)
    rect.setAttribute("y", offset.y)
    rect.setAttribute("rx", 5)
    rect.setAttribute("ry", 5)
    rect.setAttribute("width", dims.x)
    rect.setAttribute("height", dims.y)
    rect.setAttribute("stroke", "green")
    if (color == null) color = "pink"
    rect.setAttribute("style", "fill:none;stroke:" + color + ";stroke-width:0.5")
    svg.appendChild(rect)
}

// Used for debugging.
function log(msg) {
    setTimeout(function() { throw new Error(msg); }, 0);
}
