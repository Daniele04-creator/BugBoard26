package it.unina.bugboard26.backend.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@Controller
public class SpaController {

    private static final String FORWARD_INDEX = "forward:/index.html";

    @RequestMapping(value = "/", method = {RequestMethod.GET, RequestMethod.HEAD})
    public String forwardRoot() {
        return FORWARD_INDEX;
    }

    @RequestMapping(value = "/{path:[^\\.]*}", method = {RequestMethod.GET, RequestMethod.HEAD})
    public String forwardSingle(@PathVariable String path) {
        return FORWARD_INDEX;
    }

    @RequestMapping(value = "/**/{path:[^\\.]*}", method = {RequestMethod.GET, RequestMethod.HEAD})
    public String forwardNested(@PathVariable String path) {
        return FORWARD_INDEX;
    }
}
